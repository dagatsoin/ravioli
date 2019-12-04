import { uniq } from './helpers'
import { IObservable } from './IObservable'
import { Operation } from './lib/JSONPatch'
import { IObserver } from './observer/Observer'

type State = {
  observedPaths: Map<string, string[]>

  // In the case of nested transaction, this list will stored the
  // parents transaction spies
  spyQueue: string[]
  // The current observer spy id. When entering a nested transaction,
  // this stores the new spy id. When existing a nested transaction,
  // this stores the previous spy id.
  currentSpiedObserver: string

  // Store the top level transaction ID.
  // Only the top level transaction ID will trigger the learning phase.
  // So in case of nested transaction, we need to be sure which transaction
  // has just ended.
  rootTransactionId: number | undefined

  // A top level observer is running, during while computed value
  // can become alive
  isRunningTopLevelObserver: boolean

  // Flags to know at which step the new cycle is.
  // While mutating the model
  isTransaction: boolean
  // While react to the model mutation
  // Here, the mutation can only come from the computed values setting
  // their internal state.
  isLearning: boolean

  // List of sources that poped up during the initialization of a top level observer function.
  newObservers: IObserver[]

  // When a Computed value update it will $setValue on its internal observable.
  // If the new value is also an observable, it will be deep copied in the internal observable.
  // During the copy, all observable key source will be read, triggering a bunch of
  // new observed paths.
  // Those paths are not wanted here, so we need to pause the spies during this transaction.
  isSpyingDisable: boolean

  // The graph of the observers running in this container.
  observerGraph: Graph

  // A list of observables use during a transaction.
  // Once the transaction is complete, the manager will
  // alert all the concerned observers that their dependencies
  // have a new state
  updatedObservables: Map<string, IObservable>
}

function getInitState(): State {
  return {
    observedPaths: new Map(),
    spyQueue: [],
    currentSpiedObserver: '',
    isTransaction: false,
    isLearning: false,
    isRunningTopLevelObserver: false,
    rootTransactionId: undefined,
    isSpyingDisable: false,
    newObservers: [],
    observerGraph: {
      nodes: [],
      edges: [],
    },
    updatedObservables: new Map(),
  }
}

let state: State = getInitState()

declare const process: { env: { IS_DEV: boolean } }
export const isDev = true // process.env.IS_DEV;

// Zip verbose JSON patch in smaller declaration.
// Eg: a splice on array of 1000 items is declared with a {op: "splice", start: 0, deleteCount: 500, patch: "/"}
// FIXME: some operation are not observable while in non strict mode. Eg: a splice operation does not contains all the
// paths of each items moved/set/deleted but juste the parameter of the splice function. So an observer which watch
// on /array/2 won't be rettriger after a splice.
export let isStrictJSONPatch = true

export function setJSONPatchStrictMode(enabled: boolean) {
  isStrictJSONPatch = enabled
}

type Graph = {
  nodes: Node[]
  edges: Edge[]
}

type Node = IObserver

type Edge = {
  source: string
  target: string
}

function isDependent({
  target,
  source,
}: {
  target: IObserver
  source: IObserver
}): boolean {
  return target.dependenciesPath.some(path => path.includes(source.$id))
}

// Called during the constructor of a top level observer (eg: Autorun)
// This will add the observer to the graph.
export function initComputation(observer: IObserver) {
  addTarget(observer)
  // Clear the new sources list
  state.newObservers = []
}

export function addTarget(observer: IObserver) {
  // Run the target function and catch all the source popping up during execution.
  state.isRunningTopLevelObserver = true
  state.newObservers.push(observer)
  observer.runAndUpdateDeps()
  // Pass all the new sources to the graph builder
  addObservers(state.newObservers)
  state.isRunningTopLevelObserver = false
}

export function addComputedSource(observer: IObserver) {
  state.newObservers.push(observer)
}

/**
 * Add observers to the dependency graph
 */
function addObservers(observers: IObserver[]) {
  observers.forEach(function(computedSource: IObserver) {
    state.observerGraph.nodes.push(computedSource)
    observers.forEach(function(otherComputedSource: IObserver) {
      // Is the source is the parent of an other source ?
      if (
        isDependent({ target: computedSource, source: otherComputedSource })
      ) {
        state.observerGraph.edges.push({
          target: computedSource.$id,
          source: otherComputedSource.$id,
        })
      }
      // Is the observer is the child of an other observer ?
      else if (
        isDependent({ target: computedSource, source: otherComputedSource })
      ) {
        state.observerGraph.edges.push({
          target: otherComputedSource.$id,
          source: computedSource.$id,
        })
      }
    })
  })
}

/**
 * Return an observer stored in the dependencies graph.
 * Thrown if not found
 */
function getNode(id: string): IObserver {
  const child = state.observerGraph.nodes.find(observer => observer.$id === id)
  if (child) {
    return child
  } else {
    throw new Error(
      `Observer ${id} does not exists in nodes list but is present in a edge.`
    )
  }
}

function hasOneParent({
  id,
  dependencyGraph,
}: {
  id: string
  dependencyGraph: Graph
}) {
  let linkCount = 0
  for (const edge of dependencyGraph.edges) {
    if (edge.source === id) {
      // found a parent
      linkCount++
      if (linkCount > 1) {
        return false
      }
    }
  }
  return linkCount === 1
}

/**
 * Return the source observers from the graph which dependend of this top level observer.
 * If isExclusive is true. It will return only the exclusive source.
 */
function getSourceObservers({
  observerId,
  dependencyGraph,
  isExclusive,
}: {
  observerId: string
  dependencyGraph: Graph
  isExclusive: boolean
}): IObserver[] {
  const observerEdges = dependencyGraph.edges.filter(
    edge => edge.target === observerId
  )
  const childIds = observerEdges.map(({ source }) => source)

  if (isExclusive) {
    return childIds
      .map(getNode)
      .filter(node => hasOneParent({ id: node.$id, dependencyGraph }))
  } else {
    return childIds.map(getNode)
  }
}

/**
 * Return a list of observers which depends directly or indirectly on the given observable
 */
function getTargets(observableId: string): IObserver[] {
  // Get direct dependencies
  const directDependencies = state.observerGraph.nodes.filter(node =>
    node.dependenciesPath.some(path => path.includes(observableId))
  )
  const targets = directDependencies.concat(
    ...directDependencies.map(({ $id }) => getTargets($id))
  )
  return uniq(targets)
}

/**
 * Will update the graph by adding a isolated node
 */
function addNode({
  node,
  dependencyGraph,
}: {
  node: Node
  dependencyGraph: Graph
}) {
  dependencyGraph.nodes.push(node)
}

/**
 * Will update the graph by adding some edges to a node
 */
function addEdge({
  edge,
  dependencyGraph,
}: {
  edge: Edge
  dependencyGraph: Graph
}) {
  if (isDev) {
    if (
      !dependencyGraph.nodes.find(node => node.$id === edge.source) &&
      !dependencyGraph.nodes.find(node => node.$id === edge.target)
    ) {
      throw new Error(
        `ST Manager > dependency graph. Received an edge (source: ${edge.source}, target: ${edge.target} but one of the node is not present`
      )
    }
  }
  dependencyGraph.edges.push(edge)
}

function removeNode({
  nodeId,
  dependencyGraph,
}: {
  nodeId: string
  dependencyGraph: Graph
}) {
  const nodeIndex = dependencyGraph.nodes.findIndex(node => node.$id === nodeId)
  if (nodeIndex === -1) {
    throw new Error(
      `ST Manager > dependency graph > removeNode. Node ${nodeId} does not exist.`
    )
  }
  dependencyGraph.nodes.splice(nodeIndex, 1)
}

function removeNodeEdges({
  nodeId,
  dependencyGraph,
}: {
  nodeId: string
  dependencyGraph: Graph
}) {
  dependencyGraph.edges = dependencyGraph.edges.filter(
    edge => edge.source === nodeId || edge.target === nodeId
  )
}

/**
 * Will update the dependecy graph by removing a node and the associated edges
 */
function removeObserver({
  observerId,
  observerGraph: dependencyGraph,
}: {
  observerId: string
  observerGraph: Graph
}) {
  const nodeIndex = dependencyGraph.nodes.findIndex(
    node => node.$id === observerId
  )
  if (nodeIndex === -1) {
    throw new Error(
      `ST Manager > dependency graph > removeNode. Node ${observerId} does not exist.`
    )
  }
  removeNode({ nodeId: observerId, dependencyGraph })
  removeNodeEdges({ nodeId: observerId, dependencyGraph })
}

function dispose(observer: IObserver) {
  observer.dispose()
}

export function disposeObserverExclusiveChildren({
  observerId,
  observerGraph: dependencyGraph,
}: {
  observerId: string
  observerGraph: Graph
}) {
  getSourceObservers({
    observerId,
    dependencyGraph,
    isExclusive: true,
  }).forEach(dispose)
}

export function onDisposeObserver(observerId: string) {
  disposeObserverExclusiveChildren({
    observerId,
    observerGraph: state.observerGraph,
  })
  removeObserver({ observerId, observerGraph: state.observerGraph })
}

export function countUpdatedObservables(): number {
  return state.updatedObservables.size
}

export function UID() {
  return Math.floor(Math.random() * 1000000)
}

export function addUpdatedObservable(observable: IObservable) {
  // This is why we need a map for updatedObservables list.
  // It is quicker to look up with has instead of
  if (!state.updatedObservables.has(observable.$id) && state.isTransaction) {
    state.updatedObservables.set(observable.$id, observable)
  }
}

export function isFlaggedAsUpdated(id: string) {
  return state.updatedObservables.has(id)
}

export function startSpyObserver(observerId: string) {
  // Pause the current spy if any.
  // Store its id to resume it after this new spy will finish.
  state.spyQueue.push(observerId)
  state.currentSpiedObserver = observerId
  state.observedPaths.set(state.currentSpiedObserver, [])
}

export function stopSpyObserver(observerId: string): string[] {
  const paths = state.observedPaths.get(observerId) || []
  state.spyQueue.pop()
  state.currentSpiedObserver = state.spyQueue[state.spyQueue.length - 1] || ''

  state.observedPaths.delete(observerId)
  return paths
}

export function pauseSpies() {
  state.isSpyingDisable = true
}

export function resumeSpies() {
  state.isSpyingDisable = false
}

export function addObservedPath(path: string) {
  if (state.isSpyingDisable) {
    return
  }
  const paths = state.observedPaths.get(state.currentSpiedObserver)
  if (!!paths && !paths.includes(path)) {
    paths.push(path)
  }
}

function collectTransactionPatches(
  updatedObservables: Map<string, IObservable>
) {
  const transactionPatches: Array<[string, Operation[]]> = []
  updatedObservables.forEach(observable => {
    if (observable.$patch.length) {
      transactionPatches.push([observable.$id, observable.$patch])
      observable.$transactionDidEnd()
    }
  })
  return transactionPatches
}

export function transaction(fun: () => any) {
  const id = UID()
  if (!state.rootTransactionId) {
    // This transaction is a root transaction and can contain nested transactions.
    // Also, only the root transaction can set the isTransaction flag
    state.rootTransactionId = id
    state.isTransaction = true
  }
  const result = fun()
  if (state.rootTransactionId === id) {
    state.isTransaction = false
    state.rootTransactionId = undefined
    nextState()
  }
  return result
}

/**
 * The observable (the model) has been updated.
 * It is time to compute the new state by updating the observers which depends on the model.
 */
export function nextState() {
  state.isLearning = true
  // List all observers which are dependant of the observale mutated during the transaction.
  const staleObservers: IObserver[] = []
  state.updatedObservables.forEach(obs => {
    getTargets(obs.$id)
      // Remove duplicate. An observer can be present because it is dependent of a previous observable.
      .filter(o => staleObservers.indexOf(o) === -1)
      // Mark them as stale.
      .forEach(o => {
        o.isStale = true
        staleObservers.push(o)
      })
  })
  // Do something with the transaction patch
  collectTransactionPatches(state.updatedObservables)

  // Update the observers
  runStaleObservers(staleObservers)

  // The learning phase is over. Prepare the the state for the next step.
  state.updatedObservables.clear()
  state.newObservers = []
  state.isLearning = false
}

/**
 * Recompute observers and update dependency graph if needed
 */
function runStaleObservers(staleObservers: IObserver[]) {
  staleObservers.forEach(observer => {
    observer.runAndUpdateDeps()
  })
  // Put new observable in the dependency graph
  addObservers(state.newObservers)
}

export function isWrittable(): boolean {
  return state.isTransaction || state.isLearning
}

export function isTransaction(): boolean {
  return state.isTransaction
}

export function isLearning(): boolean {
  return state.isLearning
}

export function isRunningTopLevelObserver(): boolean {
  return state.isRunningTopLevelObserver
}

export function clearContainer() {
  state = getInitState()
}

export function getState(): State {
  return {
    observedPaths: new Map(state.observedPaths),
    spyQueue: [...state.spyQueue],
    currentSpiedObserver: state.currentSpiedObserver,
    isTransaction: state.isTransaction,
    isLearning: state.isLearning,
    isRunningTopLevelObserver: state.isRunningTopLevelObserver,
    rootTransactionId: state.rootTransactionId,
    isSpyingDisable: state.isSpyingDisable,
    newObservers: [...state.newObservers],
    observerGraph: {
      nodes: [...state.observerGraph.nodes],
      edges: [...state.observerGraph.edges],
    },
    updatedObservables: new Map(state.updatedObservables),
  }
}
