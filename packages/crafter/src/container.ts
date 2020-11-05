import { toNode, getRoot, getSnapshot, unique, isUnique, toInstance, noop, makePath } from './helpers'
import { IObservable } from './IObservable'
import { Command, Migration } from './lib/JSONPatch'
import { isObserver, isReaction, isDerivation } from './observer/Observer'
import { IObserver, ObserverType } from "./observer/IObserver"
import { Graph, removeNode, removeNodeEdges, getGraphEdgesFrom, Edge, getAllPathsTo, getEdgesOf, hasEdge, isSameEdge, topologicalSort } from './Graph'
import { INodeInstance } from './lib/INodeInstance'
import { ContainerState, IContainer, StepListener, ControlState, StepLifeCycle } from './IContainer'
import { isNode } from './lib/isNode'
import { isObservable } from './lib/observable'
import { mergeMigrations } from './utils/utils'
import { IInstance } from './lib'
import { IDerivation } from './observer/IDerivation'

function getInitState(): ContainerState {
  return {
    migration: {forward: [], backward: []},
    controlState: ControlState.READY,
    uids: [],
    spiedObserversDependencies: new Map(),
    spyReactionQueue: [],
    referencableNodeInstances: new Map(),
    nestedStepLevel: 0,
    //isTransaction: false,
    isComputingNextState: false,
    activeDerivations: new Map(),
 //   rootTransactionId: undefined,
    activeGraph: {
      nodes: [],
      edges: [],
    },
    staleReactions: [],
    updatedObservablesGraph: {
      nodes: [],
      edges: [],
    },
    updatedObservables: []
  }
}

export class CrafterContainer implements IContainer {
  constructor() {
    // Init private field
    this.stateBackup = this.snapshot
  }

  public get snapshot(): ContainerState {
    return {
      migration: {forward: this._state.migration.forward.map(op => ({...op})), backward: this._state.migration.backward.map(op => ({...op}))},
      controlState: this._state.controlState,
      uids: [...this._state.uids],
      referencableNodeInstances: new Map(this._state.referencableNodeInstances),
      spiedObserversDependencies: new Map(this._state.spiedObserversDependencies),
      spyReactionQueue: [...this._state.spyReactionQueue],
   //   isTransaction: this.state.isTransaction,
      activeDerivations: this._state.activeDerivations,
      isComputingNextState: this._state.isComputingNextState,
      nestedStepLevel: this._state.nestedStepLevel,
  //    rootTransactionId: this.state.rootTransactionId,
      activeGraph: {
        nodes: [...this._state.activeGraph.nodes],
        edges: [...this._state.activeGraph.edges],
      },
      staleReactions: [...this._state.staleReactions],
      updatedObservablesGraph: {
        nodes: [...this._state.updatedObservablesGraph.nodes],
        edges: [...this._state.updatedObservablesGraph.edges],
      },
      updatedObservables: [...this._state.updatedObservables]
    }
  }

  // Listeners to migration event triggered after each step
  private stepListeners:  Record<StepLifeCycle, StepListener[]> = {
    [StepLifeCycle.START]: [],
    [StepLifeCycle.DID_UPDATE]: [],
    [StepLifeCycle.WILL_PROPAGATE]: [],
    [StepLifeCycle.DID_PROPAGATE]: [],
    [StepLifeCycle.WILL_END]: [],
    [StepLifeCycle.WILL_ROLL_BACK]: [],
    [StepLifeCycle.DID_ROLL_BACK]: [],
  }

  public get isWrittable(): boolean {
    return this._state.controlState === ControlState.MUTATION || this._state.controlState === ControlState.STALE
  }
  
/*   public get isTransaction(): boolean {
    return this.state.controlState !== ControlState.READY
  }
 */
  public get isRunningReaction(): boolean {
    const current = this._state.spyReactionQueue[this._state.spyReactionQueue.length - 1]
    return current && isReaction(current.type)
  }

  public get state() {
    return this._state
  }

  private _state: ContainerState = getInitState()
  private isSpyingPaused: boolean = false
  private get isSpying() {
    return !this.isSpyingPaused && (this._state.spyReactionQueue.length > 0)
  }

  /**
   * Called during the constructor of a reaction.
   * This will add the observer and its dependencies to the graph.
   */
  public initReaction(reaction: IObserver): void {
    this.registerObserver(reaction)
    // Run the target function and collect all the observers popping up during execution.
    reaction.runAndUpdateDeps() 
  }

  public notifyRead(instance: IObservable, observedPath: string): void {
    if (!this.isSpying) {
      return
    }    
    // Store path
    if (this.isSpyingPaused) {
      return
    }
    const spiedObserverId = this.getCurrentSpiedObserverId()?.id
    // Special case, the read observable is the value of the derivation itself.
    if (spiedObserverId && observedPath.includes(spiedObserverId)) {
      return
    }
    if (spiedObserverId) {
      const paths = this._state.spiedObserversDependencies.get(spiedObserverId)
      // Path is not present, add it.
      if (!!paths && !paths.includes(observedPath)) {
        // The previous added path is a parent of this path.
        // That means that an observer is reading a nested observable property.
        // Replace the previous place, otherwise observers will "over" react.
        const previousPath = paths[paths.length - 1]
        const isChildOfPreviousPath = observedPath.includes(previousPath)

        if (isChildOfPreviousPath) {
          paths[paths.length - 1] = observedPath
          // Remove parent dependency
          this.removeParentDependency(spiedObserverId, instance)
        }
        // This path is not a child of the previous path.
        // The observer is reading a new path.
        else {
          paths.push(observedPath)
        }

        // Add to the graph
        this.addDependency(spiedObserverId, instance)
      }
    }
  }

  private stateBackup: ContainerState

  /**
   * A Step begins when a proposal is presented to the model.
   * 1- the model context is locked. No proposal can be accepted as long the transaction is running.
   * 2- the model context enters the MUTATION state
   * 3- The model accepts a part or the whole proposal.
   * 4- the model context enters the STALE state.
   * 5- the model context enters the READY state
   * 6- the modem context is unlocked
   */
  public step(fun: () => any): any {

    /* 1 */
    // Reject if a transaction is already running
/*     if (this.state.controlState !== ControlState.READY) {
      warn('[CRAFTER] A transaction is already running')
      return
    }
 */    this.onStep(StepLifeCycle.START)
    // A new step is starting.
    // Maybe it is a nested step. Keep track of the deep level.
    this._state.nestedStepLevel++

    /* 2 */
    // Lock the model
    this._state.controlState = ControlState.MUTATION
    
    // If a root step, start backup the actual container state.
    // It will use for rollback later if the step throw an error.
    if (this._state.nestedStepLevel === 0) {
      this.stateBackup = this.snapshot
    }

    let result: any
    /* 3 */
    // Proposal presentation.
    // The mutation function is passed down to the model.
    // If it throws, the system will rollback to a stable version
    try {
      this.pauseSpies()
      result = fun()
      this.resumeSpies()
      this.onStep(StepLifeCycle.DID_UPDATE)
    } catch (e) {
      this.onStep(StepLifeCycle.WILL_ROLL_BACK)
      this.rollback(this.stateBackup)
      this.onStep(StepLifeCycle.DID_ROLL_BACK)
      this.resumeSpies()
      this._state.nestedStepLevel = 0
      this._state.controlState = ControlState.READY
      if (__DEV__) {
        throw e
      }
      return
    }

    // The step presentation is finished, decrease the step level tracker.
    this._state.nestedStepLevel--

    // If it is a nested step, we don't run the learning phase
    // until the root step presentation is finished.

    if (this._state.nestedStepLevel > 0) {
      return result
    }

    // Mutation is finished, some observable may be stale.
    this._state.controlState = ControlState.STALE      
   
    this.onStep(StepLifeCycle.WILL_PROPAGATE)
    // Invalidate snapshot.
    // Their next computation will be triggered lazily.
    /* this.state.updatedObservables.forEach((o: IObservable) => {
      // It is a tracker
      if ((o as any).isTracker) {
        return
      } else {
        if (isNode(o)) {
          invalidateSnapshot(toNode(o))
        } else if (!isRoot(toInstance(o))) {
          invalidateSnapshot(toNode(toInstance(o).$parent))
        }
      }
    }) */

    // LEARNING PHASE
    // The observable has been updated.
    // It is time to notify the derivation that something has changed.
    
    this.propagateChange()
    this.onStep(StepLifeCycle.DID_PROPAGATE)
    // All computed values affected by the last observables mutation are now flagged as stale.
    // Let's run the reaction which uses those computed values.
    this.runStaleReactions()

    this._state.controlState = ControlState.READY

    // CLEANING PHASE
    // Reset the state to get ready for a new step
    
    this.onStep(StepLifeCycle.WILL_END)

    this.clean()

    return result
  }

  /**
   * Callback to remove unused observer and dependencies from the state.
   */
  public onDisposeObserver(observer: IObserver): void {
    onDisposeObserver(observer, this._state)
  }

  /**
   * Get a free UID for this container
   */
  public getUID(prefix?: string): string {
    let id: string
    do {
      id = prefix + Math.floor(Math.random() * 1000000).toString()
    } while (this._state.uids.includes(id))
    return id
  }

  /**
   * Return true if this UID is free to use in the container
   */
  public isUID(id: string): boolean {
    return !this._state.uids.includes(id)
  }

  /**
   * Return true if this UIS is used in the container
   */
  public hasUID(id: string): boolean {
    return this._state.uids.includes(id)
  }

  /**
   * Register this UID
   */
  public useUID(id: string): void {
    this._state.uids.push(id)
  }

  /**
   * Free this UID
   */
  public removeUID(id: string): void {
    this._state.uids.splice(this._state.uids.indexOf(id), 1)
  }

  /**
   * Add an updated observable reference to the list of updated observables
   * during the current transaction.
   */
  public addUpdatedObservable(observable: IObservable): void {
    if (!this._state.updatedObservables.includes(observable)) {
      this._state.updatedObservables.push(observable)
    }
  }

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given observer run.
   */
  public startSpyObserver({id, type}: IObserver): void {
    // Pause the current spy if any.
    this._state.spyReactionQueue.push({id, type})
    this._state.spiedObserversDependencies.set(id, [])
  }

  /**
   * Stop to collect observable paths and new observers for this observer
   */
  public stopSpyObserver(observerId: string): void {
    // Remove the observer id from the queue
    const data = this._state.spyReactionQueue.splice(
      this._state.spyReactionQueue.findIndex(({id}) => id === observerId),
      1
    )[0]
    data && this._state.spiedObserversDependencies.delete(data.id)
  }

  public getCurrentSpyedObserverDeps(observerId: string): string[] {
    const deps = this._state.spiedObserversDependencies.get(observerId) 
    if (deps) {
      return deps
    }
    throw new Error('[CRAFTER] unknown observer id ' + observerId)
  }

  public pauseSpies(): void {
    this.isSpyingPaused = true
  }
  
  public resumeSpies(): void {
    this.isSpyingPaused = false
  }

  public getReferenceTarget<T, S = T>(id: string): INodeInstance<T, S> {
    const ref = this._state.referencableNodeInstances.get(id)
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
    this._state.referencableNodeInstances.set(id, observable)
  }

  
  public unregisterAsReferencable(id: string): void {
    this._state.referencableNodeInstances.delete(id)
  }

  public clearContainer(): void {
    this._state = getInitState()
  }

  public presentPatch<O extends Command>(_migration: O[]): void {
/*     const staleObservers: IObserver[] = []
    migration.forEach(({op, path}) => {
      const observers = this.getTargets(makePath(path), op)
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
    }) */
  }
    
  /**
   * Remove an observer and its dependencies from the state
   */
  public onObserverError(observer: IObserver): void {
    removeObserver({observer, dependencyGraph: this._state.activeGraph})
  }

  
  public addStepListener(lifecycle: StepLifeCycle, listener: StepListener): void {
    this.stepListeners[lifecycle].push(listener)
  }

  public removeStepListener(lifecycle: StepLifeCycle, listener: StepListener): void {
    this.stepListeners[lifecycle].splice(this.stepListeners[lifecycle].indexOf(listener), 1)
  }

  public addMigration(migration: Migration, rootId: string): void {
    addIdToMigrationPaths(migration, rootId)
    this._state.migration = mergeMigrations(migration, this._state.migration)
  }

  /**
   * Remove the parent of the given source from the graph.
   * The parent will be removed if its only dependency is the given source.
   * @param targetId 
   * @param source 
   */
  private removeParentDependency(targetId: string, source: IObservable) {
    const graph = this._state.activeGraph


    const parentEdge = {
      target: targetId,
      source: toInstance(source).$parent?.$id ?? ''
    }
    // Remove the old edge
    if (hasEdge(parentEdge, graph)) {
      const parentNode = getGraphNode(parentEdge.source, graph)

      removeNodeEdges({nodeId: toInstance(parentNode).$id, dependencyGraph: graph})

      // Other edges depend on the parent node, don't delete.
      const canDeleteParentNode = getEdgesOf(parentEdge.source, graph).length < 2

      if(canDeleteParentNode) {
        removeNode({node: parentNode, dependencyGraph: graph})
      }
    }
  }

  /**
   * Register a dependency to the graph
   * @param target 
   * @param source 
   */
  private addDependency(targetId: string, source: IObservable | IDerivation<any>): void {
    // Add to the graph
    const graph = this._state.activeGraph
    const sourceId = isDerivation(source)
      ? source.id
      : source.$id

    const edge = {target: targetId, source: sourceId}
    
    if (!hasEdge(edge, graph)) {
      graph.edges.push({
        target: targetId,
        source: sourceId
      })
    }
    if (!graph.nodes.includes(source)) {
      graph.nodes.push(source)
    }
  }

  /**
   * Returns a list of observers directly dependent of the observable
   * changed by the given command.
   * @param param0
   */
/*   private getDirectDependencies(patch: Command[]): IObserver[] {
    return this.state
      .dependencyGraph
      .nodes
      .filter(isObserver)
      .filter(n => patch.some(command => isDependent(n, command, this.state.dependencyGraph.nodes.filter(isObservable))))
  }
 */

  private onStep(step: StepLifeCycle) {
    for (const cb of this.stepListeners[step]) {
      cb(this)
    }
  }

  private getCurrentSpiedObserverId(): {type: ObserverType, id: string} | undefined{
    // Derivation are prioritary because the always run as a child
    // So let's see if a derivation is running. If not, fallback to the last running reaction.
    return this._state.spyReactionQueue[this._state.spyReactionQueue.length - 1]
  }
  
  /**
   * An observer is running and a new observed just poped out.
   * Register it as a source of the current running observer
   */
  private registerObserver(observer: IObserver): void {
    // Node is already registered, quit.
    if (this._state.activeGraph.nodes.includes(observer)) {
      return
    }
    // The current spied is empty. This is because we are registring
    // the root reaction. Do not add edge, but add the node.
    const target = this.getCurrentSpiedObserverId()?.id
    if (target) {
      this._state.activeGraph.edges.push({
        target,
        source: observer.id
      })
    }
    this._state.activeGraph.nodes.push(observer)
  }

  /**
   * Return true if this observable is an indirect dependency of the target
   * @param target 
   * @param obs 
   */
  private isIndirectTarget(target: IObserver, obs: IObservable) {
    return getAllPathsTo({
      targetId: target.id,
      graph: this._state.activeGraph
    }) 
    .some(path => {
      const obsIndex = path.indexOf(obs.$id)
      // The observer $id is present in the path but is not a child of the target.
      // It is an indirect dependency.
      return obsIndex > -1 && obsIndex < path.length - 2
    })
  }

  /**
   * Propagate the changes of the observables into the graph and update all derivations
   * when necessary to reach a new stable state.
   * The reactions are not run at this point.
   * The propagation is done with a topological order. That means that a derivation will
   * be tested as stale only of all its descendants are ready.
   * 1- find all the direct observers of the updated observables.
   * From this selection:
   * 2- find observers which have also indirect sources in the updated observables.
   *    eg. C0 -> O, C2 -> O, C2 -> C1 
   *        C2 is both a direct and indirect target of O
   *        C2 won't be ran until all its dependencies have been run.
   * 4- run only direct targets which is plain dependant of the updated observables
   * 5- recall the function with:
   *    - the new updated observables from the ran derivations
   *    - the previous updated observable which are source of indirect observers
   *    - the new staled derivations.
   * @param observables
   * @returns the ids of the stale derivations
   */
/*   private propagateChange(_ranDerivationIds: string[] = []) {   
    // 1 
    const directTargets = this.getDirectDependencies({
      target: this.state.dependencyGraph,
      from: this.state.updatedObservablesGraph
    }) 
    // Keep only derivations
    .filter(isDerivation)
    // Filter already ran derivations
    .filter(({id}) => !_ranDerivationIds.includes(id))

    // 3
    // Find the observers of the updated observables graph which are directly AND indirectly dependent
    // of the updated observables graph.
    const notReadyToRunDerivations: IObserver[] = [] 

    for (const obs of this.state.updatedObservablesGraph.nodes) {
      // Is this observable is used as an indirect source of a direct target.
      for (const target of directTargets) {
        if (isDerivation(target) && isObservable(obs) && this.isIndirectTarget(target, obs)) {
          notReadyToRunDerivations.push(target)
        }
      }
    }

    function isReady(derivation: IObserver) {
      return !notReadyToRunDerivations.includes(derivation)
    }
          
    //4
    const readyToRunDerivation = directTargets
      .filter(isDerivation)
      .filter(isReady)
    const ranComputedIds: string[] = []  
    
    readyToRunDerivation
      .forEach(derivation => {
        derivation.runAndUpdateDeps()
        ranComputedIds.push(derivation.id)
      })

    //5
    // Recursive call returning the reactions to run.
    if (this.state.updatedObservablesGraph.nodes.length) {
      this.propagateChange(ranComputedIds)
    }
  } */

  /**
   * Propagate the changes of the observables into the graph and update all derivations
   * when necessary to reach a new stable state.
   * This will update the State.staleReactions.
   * The reactions are not run at this point.
   * The propagation is done with a topological order to stale
   * child observer before parent observer.
   */
  private propagateChange() {
    const observers = topologicalSort(this._state.activeGraph)
      .map(id => getGraphNode(id, this._state.activeGraph))
      .filter(isObserver)

    observers.forEach(observer => {
      // Notify the observer that something changes.
      // If the osbserver is concerned by the change, it becomes stale.
      observer.notifyChanges(this._state.migration.forward, this._state.updatedObservables.map(o=> makePath(getRoot(o as IInstance<any>).$id, o.$path)))
    })

    // Retain the reactions ids to run.
    this._state.staleReactions = observers
      .filter(isReaction)
      .filter(({isStale}) => isStale)
  }

  /**
   * The observable (the model) has been updated.
   * It is time to notify the derivation that something has changed.
   * We stale all the derivations which depends of the model.
   */
  private clean(): void {
    // Delete migration data
    this._state.migration.forward.length = 0
    this._state.migration.backward.length = 0
    
    // Delete updated observable
    this._state.updatedObservables = []
    
    // Reset list of stale reactions
    this._state.staleReactions = []
  }

  /**
   * Recompute observers and update dependency graph if needed
   */
  private runStaleReactions(): void {
    this._state.staleReactions
      .forEach(reaction => {
        // Run the stale reaction
        // Meanwhile, compare each child derivation poping out
        // and remove the ones which are not used anymore
        reaction.runAndUpdateDeps()
      })
  }

  private rollback(managerStateBackup: ContainerState | undefined): void {
    const rootIds: string[] = []
    this._state.updatedObservables.forEach(function (o) {
      
        const root = getRoot(toInstance(o))
        if (!rootIds.includes(root.$id)) {
          root.$type.applySnapshot(root, getSnapshot(toNode(root)))
          rootIds.push(root.$id)
        }
      
    })
    if (managerStateBackup) {
      this._state = managerStateBackup
    }
    this.resumeSpies()
  }
}

/**
 * Return an observer stored in the dependencies graph.
 * Thrown if not found
 */
function getGraphNode(id: string, graph: Graph<IObservable | IObserver | IDerivation<any>>): IObserver | IObservable {
  const child = graph
    .nodes
    .find(node => getNodeId(node) === id)
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
  observer,
  dependencyGraph,
}: {
  observer: IObserver
  dependencyGraph: Graph<IObserver | IObservable>
}): void {
  const targetId = dependencyGraph
    .nodes
    .filter(isObserver)
    .find(node => node.id === observer.id)?.id

  if (targetId) {
    // Remove all dependencies of this observer
    const deps = getGraphEdgesFrom({
      targetId,
      graph: dependencyGraph
    })
      // Gather all nodes of the tree
      .reduce<string[]>((ids, edge) => ids.concat([edge.source, edge.target]), [])
      .filter(isUnique)
      // Delete each node and their edges
    if (deps.length) {
      deps.forEach(id => {
        const node = getGraphNode(id, dependencyGraph)
        removeNode({node, dependencyGraph})
        removeNodeEdges({ nodeId: getNodeId(node), dependencyGraph })
      })
    } else {
      removeNode({node: observer, dependencyGraph})
    }
  }
}

/**
 * Return the id of an observable or an observer
 * @param node
 */
function getNodeId(node: IObservable | IObserver | IDerivation<any>): string {
  return isObservable(node)
    ? isDerivation(node)
      ? node.id
      : node.$id
    : node.id
}

function disposeComputation(computation: IObserver): void {
  computation.dispose()
}

/**
 * Return a tree which root is the given target id.
 * The tree contains only nodes which have one parent.
 */
function getDependencyTree({
  targetId,
  graph
}: {
  targetId: string,
  graph: Graph<IObserver | IObservable>
}): Graph<IObserver | IObservable> {
  const edges = getGraphEdgesFrom({
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

function onDisposeObserver(observer: IObserver, state: ContainerState): void {
  // Get all the observers dependent of the caller.
  // An observer wich is also a dependeny on other top level observer will stay untouched.
  const graph = state.activeGraph
  const tree = getDependencyTree({
    targetId: observer.id,
    graph,
  })
  // Remove caller from the graph
  removeObserver({
    observer,
    dependencyGraph: graph
  })

  // Dispose observer and remove it from the graph
  tree.nodes
    // The passed target id is already disposed. Avoid infinite loop.
    .forEach(node => {
      if (isObserver(node) && observer.id !== node.id) {  
        disposeComputation(node)
        removeObserver({
          observer: node,
          dependencyGraph: graph
        })
      } else {
        
      }
    })
  // Remove edges from the graph
  graph.edges = graph.edges.filter(edge => !tree.edges.some(treeEdge => isSameEdge(edge, treeEdge))) 
}

/**
 * Invalidate the snaphsot of each node/leaf of the ascendants of an observable.
 */
/* function invalidateSnapshot(o: INodeInstance<any>): void {
  o.$invalidateSnapshot()
  const parent = o.$parent
  if (parent) {
    invalidateSnapshot(parent)
  }
} */

/**
 * Prepend the id of the observable to each path in a migration
 */
function addIdToMigrationPaths(migration: Migration<any, any>, observableId: string): void {
    migration.forward.forEach(op => op.path = makePath(observableId, op.path))
    migration.backward.forEach(op => op.path = makePath(observableId, op.path))
}