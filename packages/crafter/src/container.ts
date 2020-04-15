import { toNode, getRoot, getSnapshot, unique, makePath } from './helpers'
import { IObservable } from './IObservable'
import { Operation, isDependent, hasPath, Migration } from './lib/JSONPatch'
import { IObserver, ObserverType } from './observer/Observer'
import { Graph, removeNode, removeNodeEdges, getTreeEdges, Edge } from './Graph'
import { INodeInstance } from './lib/INodeInstance'
import { Tracker } from './lib/Tracker'
import { State, IContainer, ContextListener } from './IContainer'
import { Computed } from './observer/Computed'
import { isNode } from './lib/isNode'

function getInitState(): State {
  return {
    isWrittable: true,
    uids: [],
    observedPaths: new Map(),
    spyDerivationQueue: [],
    spyReactionQueue: [],
    referencableNodeInstances: new Map(),
    isTransaction: false,
    contextListeners: [],
    isComputingNextState: false,
    activeDerivations: new Map(),
    rootTransactionId: undefined,
    isSpyingDisable: false,
    dependencyGraph: {
      nodes: [],
      edges: [],
    },
    updatedObservables: new Map()
  }
}

export class CrafterContainer implements IContainer {
  public get snapshot(): State {
    return {
      isWrittable: this.state.isWrittable,
      uids: [...this.state.uids],
      referencableNodeInstances: new Map(this.state.referencableNodeInstances),
      observedPaths: new Map(this.state.observedPaths),
      spyDerivationQueue: [...this.state.spyDerivationQueue],
      spyReactionQueue: [...this.state.spyReactionQueue],
      isTransaction: this.state.isTransaction,
      contextListeners: [...this.state.contextListeners],
      activeDerivations: this.state.activeDerivations,
      isComputingNextState: this.state.isComputingNextState,
      rootTransactionId: this.state.rootTransactionId,
      isSpyingDisable: this.state.isSpyingDisable,
      dependencyGraph: {
        nodes: [...this.state.dependencyGraph.nodes],
        edges: [...this.state.dependencyGraph.edges],
      },
      updatedObservables: new Map(this.state.updatedObservables)
    }
  }

  public get isWrittable(): boolean {
    return this.state.isTransaction || this.state.isComputingNextState
  }
  
  public get isTransaction(): boolean {
    return this.state.isTransaction
  }

  public get isRunningReaction(): boolean {
    return !!this.getCurrentSpiedReactionId()
  }

  private state: State = getInitState()

  /**
   * Called during the constructor of a reaction.
   * This will add the observer and its dependencies to the graph.
   */
  public initReaction(reaction: IObserver): void {
    this.registerObserver(reaction)
    // Run the target function and collect all the observers popping up during execution.
    reaction.runAndUpdateDeps() 
  }

  /**
   * Register a computed source to the container graph
   */
  public registerComputedSource(computed: IObserver): void {
    this.registerObserver(computed)
  }

  public addObservedPath(path: string): void {
    if (this.state.isSpyingDisable) {
      return
    }
    const paths = this.state.observedPaths.get(this.getCurrentSpiedDerivationId())
    if (!!paths && !paths.includes(path)) {
      paths.push(path)
    }
  }

  /**
   * A transaction is the smallest unit of work of Crafter app.
   * This tends to be as ACID as possible. (mainly from wikipedia)
   * Atomicity: A transaction's changes to the model state are atomic: either all happen or none happen.
   * Consistency: A transaction is a correct transformation of the model state. It is the responsability of the model to accept, reject or throw to any changes.
   *  Also, the system will rollback to the previous stable state if it throws during transaction.
   * Isolation: The transaction execution is syncrhronous. It is no possible to have async command during transaction or having two transactions in the same times.
   * Durability: Once a transaction completes successfully, its changes are saved as patch (with rollback/forward command list) and a snapshot of the new model.
   */
  public transaction(fun: () => any): any {
    const id = this.getUID('Transaction#')
    const isRootTransactionStart = !this.state.rootTransactionId
    const managerStateBackup = isRootTransactionStart ? this.snapshot : undefined

    // There is no running transaction yet. This transaction is now the root transaction.
    if (isRootTransactionStart) {
      this.state.rootTransactionId = id
      this.state.isTransaction = true
    }
    let result: any
    // Execute the transaction changes.
    // If it throws, the system will rollback to a stable version
    try {
      if (!this.state.isWrittable) {
        throw new Error('Transaction are not allowed here.')
      }
      this.pauseSpies()
      result = fun()
      this.resumeSpies()
    } catch (e) {
      // Bubble the error up until reaching the root transaction
      if (this.state.rootTransactionId !== id) {
        console.error(e)
        throw e
      }
      // Error has reached the root transaction, rollback the model.
      else {
        this.rollback(managerStateBackup)
        if (__DEV__) {
          throw e
        }
        return
      }
    }

    // Transaction is finished, some observable may stale.
    if (this.state.rootTransactionId === id) {
      this.state.isTransaction = false
      this.state.rootTransactionId = undefined
      // Invalidate snapshot.
      // Their next computation will be triggered lazily.
      this.state.updatedObservables.forEach((o: IObservable) => {
        // It is a tracker
        if (isNode(o)) {
          return
        } else if (isNode(o)) {
          invalidateSnapshot(o)
        }
      })
      
      this.nextState(this.state) 
      
    }
    return result
  }

  /**
   * Callback to remove unused observer and dependencies from the state.
   */
  public onDisposeObserver(targetId: string): void {
    onDisposeObserver(targetId, this.state)
  }

  /**
   * Get a free UID for this container
   */
  public getUID(prefix?: string): string {
    let id: string
    do {
      id = prefix + Math.floor(Math.random() * 1000000).toString()
    } while (this.state.uids.includes(id))
    return id
  }

  /**
   * Return true if this UID is free to use in the container
   */
  public isUID(id: string): boolean {
    return !this.state.uids.includes(id)
  }

  /**
   * Return true if this UIS is used in the container
   */
  public hasUID(id: string): boolean {
    return this.state.uids.includes(id)
  }

  /**
   * Register this UID
   */
  public useUID(id: string): void {
    this.state.uids.push(id)
  }

  /**
   * Free this UID
   */
  public removeUID(id: string): void {
    this.state.uids.splice(this.state.uids.indexOf(id), 1)
  }

  /**
   * Add an updated observable reference to the liste of updated observables
   * during the current transaction.
   */
  public addUpdatedObservable(observable: IObservable): void {
    // This is why we need a map for updatedObservables list.
    // It is quicker to look up with Map.has instead of Array.find
    if (!this.state.updatedObservables.has(observable.$id) && this.state.isTransaction) {
      this.state.updatedObservables.set(observable.$id, observable)
    }
  }

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given reaction id run.
   */
  public startSpyReaction(reactionId: string): void {
    // Pause the current spy if any.
    this.state.spyReactionQueue.push(reactionId)
    this.startSpyDerivation(reactionId)
  }

  /**
   * Stop to collect observable paths and new observers for this reaction and
   * return the paths.
   */
  public stopSpyReaction(reactionId: string): string[] {
    this.state.spyReactionQueue.pop()
    return this.stopSpyDerivation(reactionId)
  }

  /**
   * Start the manager to collect all observables paths for the
   * given derication id run.
   */
  public startSpyDerivation(derivationId: string): void {
    // Pause the current spy if any.
    this.state.spyDerivationQueue.push(derivationId)
    this.state.observedPaths.set(derivationId, [])
  }

  /**
   * Stop to collect observable paths and for this derivation and
   * return the paths.
   */
  public stopSpyDerivation(derivationId: string): string[] {
    const paths = this.state.observedPaths.get(derivationId) || []
    this.state.spyDerivationQueue.pop()
    this.state.observedPaths.delete(derivationId)
    return paths
  }

  public pauseSpies(): void {
    this.state.isSpyingDisable = true
  }
  
  public resumeSpies(): void {
    this.state.isSpyingDisable = false
  }

  public addObservedmakePath(path: string): void {
    if (this.state.isSpyingDisable) {
      return
    }
    const paths = this.state.observedPaths.get(this.getCurrentSpiedDerivationId())
    if (!!paths && !paths.includes(path)) {
      paths.push(path)
    }
  }

  public blockTransaction<T>(fn: () => T): T {
    this.state.isWrittable = false
    const result = fn()
    this.state.isWrittable = true
    return result
  }

  public getReferenceTarget<T, S = T>(id: string): INodeInstance<T, S> {
    const ref = this.state.referencableNodeInstances.get(id)
    if (!ref) {
      throw new Error(
        `Crafter Reference error. Node ${id} is not listed as active`
      )
    }
    return ref
  }

  public registerAsReferencable(
    id: string,
    observable: INodeInstance<any>
  ): void {
    this.state.referencableNodeInstances.set(id, observable)
  }

  
  public unregisterAsReferencable(id: string): void {
    this.state.referencableNodeInstances.delete(id)
  }

  public clearContainer(): void {
    this.state = getInitState()
  }

  public subscribe(listener: ContextListener): void {
    this.state.contextListeners.push(listener)
  }

  public unsubscribe(listener: ContextListener): void {
    this.state.contextListeners.splice(this.state.contextListeners.indexOf(listener), 1)
  }

  public presentPatch<O extends Operation>(patch: O[]): void {
    const staleObservers: IObserver[] = []
    patch.forEach(({op, path: _path}) => {
      const observers = this.getTargets(makePath(_path), op)
      // Remove duplicate. An observer can be present because it is dependent of a previous observable.
      .filter(o => staleObservers.indexOf(o) === -1)
    
      // TODO
      // Send changes to the observers to let them decide if they are stale or not.
      observers.forEach(o => o.notifyChangeFor())

      // Add stale observers
      staleObservers.push(
        ...observers
          .filter(({isStale}) => isStale)
          .filter(isTopLevelObserver)
      )

      // All computed values affected by the last observables mutation are now flagged as stale.
      // Let's run the reaction which uses those computed values.
      this.runReactions(staleObservers)
    })
  }
    
  /**
   * Remove an observer and its dependencies from the state
   */
  public onObserverError(observerId: string): void {
    removeObserver({observerId, observerGraph: this.state.dependencyGraph})
  }

  /**
   * Return a list of observers which depends directly or indirectly on the given observable
   */
  private getTargets(_path: string, op?: Operation['op']): IObserver[] {
    // Get direct dependencies
    const directDependencies: IObserver[] = []
    if (op) {
      directDependencies.push(...this.getDirectDependencies({path: _path, op}))
    } else {
      directDependencies.push(...this.state.dependencyGraph.nodes.filter(node => hasPath(node, _path)))
    }
    const targets = directDependencies.concat(
      ...directDependencies.map(dep => {
        // If the dep is a derivation, we retrieve its id (for boxed value, the computed if, otherwise the value id)
        const sourceId = dep.type === ObserverType.Computed
          ? (dep as Computed<any>).observedValueId
          : dep.id
        return this.getTargets(makePath(sourceId))
      })
    )
    return targets.filter(unique)
  }

  private getDirectDependencies({op, path: _path}: Operation): IObserver[] {
    return this.state.dependencyGraph.nodes.filter(isDependent({op, path: _path}))
  }

  private getCurrentSpiedReactionId(): string {
    return this.state.spyReactionQueue[this.state.spyReactionQueue.length - 1] || ''
  }

  private getCurrentSpiedDerivationId(): string {
    return this.state.spyDerivationQueue[this.state.spyDerivationQueue.length - 1] || ''
  }
  
  /**
   * An observer is running and a new observed just poped out.
   * Register it as a source of the current running observer
   */
  private registerObserver(observer: IObserver): void {
    // Node is already registered, quit.
    if (this.state.dependencyGraph.nodes.includes(observer)) {
      return
    }
    // The current spied is empty. This is because we are registring
    // the root reaction. Do not add edge, but add the node.
    const target = this.getCurrentSpiedDerivationId()
    if (target) {
      this.state.dependencyGraph.edges.push({
        target,
        source: observer.id
      })
    }
    this.state.dependencyGraph.nodes.push(observer)
  }

  /**
   * The observable (the model) has been updated.
   * It is time to notify the derivation that something has changed.
   * We stale all the derivations which depends of the model.
   */
  private nextState(state: State): void {
    state.isComputingNextState = true
    // List all observers which are dependant of the observale mutated during the transaction.
    const staleObservers: IObserver[] = []
    state.updatedObservables.forEach(updatedObservable => {
      // TODO tracker is not really an observable. Should be store somewhere else.
      // Tracker
      if (updatedObservable instanceof Tracker) {
        const observers = this.getTargets(updatedObservable.$id)      
        // TODO
        // Send changes to the observers to let them decide if they are stale or not.
        observers.forEach(o => o.notifyChangeFor())
        // Add stale observers
        staleObservers.push(...observers)
      } else if (isNode(updatedObservable)){
        // Node observable with patch
        updatedObservable.$patch.forward.forEach(({op, path}: Operation) => {
          const rootId = getRoot(updatedObservable).$id
          const observers = this.getTargets(rootId + path, op)
          // Remove duplicate. An observer can be present because it is dependent of a previous observable.
          .filter(o => staleObservers.indexOf(o) === -1)
        
          // Send changes to the observers to let them decide if they are stale or not.
          observers.forEach(o => o.notifyChangeFor())

          // Add stale observers

          // If it is a top level observer, keep it to re run it.
          // It is not necessary to run the non top level computed. If you run a top observer,
          // all dependent children will run.
          staleObservers.push(
            ...observers
            .filter(({isStale}) => isStale)
            .filter(isTopLevelObserver)
          )
        })
      }
    })
    // Do something with the transaction patch
    collectTransactionPatches(state.updatedObservables)

    // The learning phase is over. Prepare the the state for the next step.
    state.updatedObservables.clear()  

    state.isComputingNextState = false

    // All computed values affected by the last observables mutation are now flagged as stale.
    // Let's run the reaction which uses those computed values.
    this.runReactions(staleObservers)
  }

  /**
   * Recompute observers and update dependency graph if needed
   */
  private runReactions(staleReactions: IObserver[]): void {
    staleReactions.forEach(reaction => {
      // Run the stale reaction
      // Meanwhile, compare each child derivation poping out
      // and remove the ones which are not used anymore
      reaction.runAndUpdateDeps()
    })
  }

  private rollback(managerStateBackup: State | undefined): void {
    const rootIds: string[] = []
    this.state.updatedObservables.forEach(function (o) {
      if (!isNode(o)) {
        return
      }
      else {
        const root = getRoot(o)
        if (!rootIds.includes(root.$id)) {
          root.$type.applySnapshot(root, getSnapshot(toNode(root)))
          rootIds.push(root.$id)
        }
      }
    })
    if (managerStateBackup) {
      this.state = managerStateBackup
    }
    this.state.isWrittable = true
    this.resumeSpies()
  }
}

/**
 * Register a computed source to the container graph
 */

/**
 * Return an observer stored in the dependencies graph.
 * Thrown if not found
 */
function getGraphNode(id: string, graph: Graph<IObserver>): IObserver {
  const child = graph.nodes.find(observer => observer.id === id)
  if (child) {
    return child
  } else {
    throw new Error(
      `Observer ${id} does not exists in nodes list but is present in a edge.`
    )
  }
}

/**
 * Will update the dependecy graph by removing a node and the associated edges
 */
function removeObserver({
  observerId,
  observerGraph: dependencyGraph,
}: {
  observerId: string
  observerGraph: Graph<IObserver>
}): void {
  const nodeIndex = dependencyGraph.nodes.findIndex(
    node => node.id === observerId
  )
  if (nodeIndex > -1) {
    removeNode({ nodeId: observerId, dependencyGraph })
    removeNodeEdges({ nodeId: observerId, dependencyGraph })
  }
}

function disposeComputation(computation: IObserver): void {
  computation.dispose()
}

/**
 * Return a tree which root is the given target id.
 * The tree contains only nodes which have one parent.
 */
function getObserverTree({
  targetId,
  graph
}: {
  targetId: string,
  graph: Graph<IObserver>
}): Graph<IObserver> {
  const edges = getTreeEdges({
    targetId,
    graph
  })

  const nodes = edges
    .flatMap(extractNodeId)
    .filter(unique)
    .map(id => getGraphNode(id, graph))

  return {
    edges,
    nodes
  }
}

function extractNodeId(edge: Edge): [string, string] {
  return [edge.target, edge.source]
}

function onDisposeObserver(targetId: string, state: State): void {
  // Get all the observers dependent of the caller.
  // An observer wich is also a dependeny on other top level observer will stay untouched.
  const tree = getObserverTree({
    targetId,
    graph: state.dependencyGraph,
  })
  // Remove caller from the graph
  removeObserver({
    observerId: targetId,
    observerGraph: state.dependencyGraph
  })

  // Dispose observer and remove it from the graph
  tree.nodes
    // The passed target id is already disposed. Avoid infinite loop.
    .filter(({id: $id}) => $id !== targetId)
    .forEach(node => {
      disposeComputation(node)
      removeObserver({
        observerId: node.id,
        observerGraph: state.dependencyGraph
      })
    })
  // Remove edges from the graph
  state.dependencyGraph.edges = state.dependencyGraph.edges.filter(edge => !tree.edges.some(isSameEdge(edge))) 
}

const isSameEdge = (edge: Edge): (value: Edge) => boolean =>
(e: Edge): boolean => e.source === edge.source && e.target === edge.target

function collectTransactionPatches(
  updatedObservables: Map<string, IObservable>
): [string, Migration][] {
  const transactionPatches: [string, Migration][] = []
  updatedObservables.forEach(observable => {
    if (observable.$patch.forward.length) {
      transactionPatches.push([observable.$id, observable.$patch])
      observable.$transactionDidEnd()
    }
  })
  return transactionPatches
}

/**
 * Invalidate the snaphsot of each node/leaf of the ascendants of an observable.
 */
function invalidateSnapshot(o: INodeInstance<any>): void {
  o.$invalidateSnapshot()
  const parent = o.$parent
  if (parent) {
    invalidateSnapshot(parent)
  }
}

function isTopLevelObserver(observer: IObserver): boolean {
  return observer.type !== ObserverType.Computed
}