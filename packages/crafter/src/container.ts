import { toNode, getRoot, getSnapshot, unique, isUnique, toInstance, makePath } from './helpers'
import { IObservable } from './IObservable'
import { Command, Migration } from './lib/JSONPatch'
import { isDerivation, isReaction } from './observer/Observer'
import { IObserver, ObserverType } from "./observer/IObserver"
import { removeNode, removeNodeEdges, getGraphEdgesFrom, Edge, getAllPathsTo, getEdgesOf, hasEdge, isSameEdge, topologicalSort } from './Graph'
import { INodeInstance } from './lib/INodeInstance'
import { ContainerState, IContainer, StepListener, ControlState, StepLifeCycle, ObserverGraphNode } from './IContainer'
import { mergeMigrations } from './utils/utils'
import { IInstance } from './lib'

function getInitState(): ContainerState {
  return {
    migration: {forward: [], backward: []},
    uids: [],
    referencableNodeInstances: new Map(),
    nestedStepLevel: 0,
    activeDerivations: new Map(),
    observerGraph: {
      nodes: [],
      edges: [],
    }
  }
}

export class CrafterContainer implements IContainer {
  constructor() {
    // Init private field
    this.stateBackup = this.snapshot
  }

  public get snapshot(): ContainerState {
    return {
      migration: {forward: this.state.migration.forward.map(op => ({...op})), backward: this.state.migration.backward.map(op => ({...op}))},

      uids: [...this.state.uids],
      referencableNodeInstances: new Map(this.state.referencableNodeInstances),
   //   isTransaction: this.state.isTransaction,
      activeDerivations: this.state.activeDerivations,
      
      nestedStepLevel: this.state.nestedStepLevel,
  //    rootTransactionId: this.state.rootTransactionId,
      observerGraph: {
        nodes: this.state.observerGraph.nodes.map(n => ({id: n.observer.id, observer: n.observer, dependencies: [...n.dependencies] })),
        edges: [...this.state.observerGraph.edges],
      }
    }
  }

  public get controlState(): ControlState {
    return this.volatileState.controlState
  }

  public get willReact(): boolean {
    return this.volatileState.willReact
  }

  public getObserverDeps(observerId: string): string[] {
    return this.state.observerGraph.nodes.find(({observer: {id}}) => id === observerId)?.dependencies ?? []
  }

  /**
   * State that won't be restored in case of rollback.
   */
  private volatileState: { 
    /**
     * The stack of running observer ids ans type
     * All possible observer chaining:
     * - An autorun is a triggerd by an autorun
     *   [autorun0, autorun1]
     * - A derivation is triggered by an autorun
     *   [autorun0, derivation0]
     * - A derivation is triggered by a derivation
     *   [autorun0, derivation0, derivation1]
     * We can not have:
     * - A derivation alone
     *   [derivation0]
     * - A derivation between two reactions. (A derivation can not trigger a side effect)
     *   [autorun0, derivation0, autorun1]
     */
    spyReactionQueue: {type: ObserverType, id: string}[]
    spiedObserversDependencies: Map<string, string[]>

    /*
    *Current control state of the model in the SAM lifecyle 
    */
    controlState: ControlState

    /**
     * While computing new state
     * Here, the mutation can only come from the computed values setting
     * their internal state.
     */
    isComputingNextState: boolean

    /**
     * A list of observables used during a step.
     * Once the step is complete, the manager will
     * update the derivations then the reactions which depends on them
     */
    updatedObservables: IObservable[]

    /**
     * A stack of JSON patch generated by the derivation when they update during
     * the learning phase
     */
    derivationPatch: Command[]

    /**
     * Store the observable of the derivations mutated during the learning phase.
     */
    derivationUpdatedObservable: IObservable[]

    /**
     * Flag to know if the step mutations will be tracked.
     */
    willReact: boolean
  } ={
    spiedObserversDependencies: new Map(),
    spyReactionQueue: [],
    controlState: ControlState.READY,
    isComputingNextState: false,
    updatedObservables: [],
    derivationPatch: [],
    derivationUpdatedObservable: [],
    willReact: true
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
    return this.volatileState.controlState === ControlState.MUTATION || !this.volatileState.willReact//this.volatileState.controlState === ControlState.STALE
  }
  
/*   public get isTransaction(): boolean {
    return this.state.controlState !== ControlState.READY
  }
 */
  public get isRunningReaction(): boolean {
    const current = this.volatileState.spyReactionQueue[this.volatileState.spyReactionQueue.length - 1]
    return current && isReaction(current.type)
  }

  private state: ContainerState = getInitState()
  private isSpyingPaused: boolean = false
  private get isSpying() {
    return !this.isSpyingPaused && (this.volatileState.spyReactionQueue.length > 0)
  }

  /**
   * An observer is running and a new observed just poped out.
   * Register it as a source of the current running observer
   */
  public registerObserver(observer: IObserver): void {
    // Node is already registered, quit.
    if (this.state.observerGraph.nodes.some(({observer: o}) => o === observer)) {
      return
    }
    // The current spied is empty. This is because we are registring
    // the root reaction. Do not add edge, but add the node.
    const target = this.getCurrentSpiedObserverId()?.id
    if (target) {
      this.state.observerGraph.edges.push({
        target,
        source: observer.id
      })
    }
    this.state.observerGraph.nodes.push({
      id: observer.id,
      observer,
      dependencies: []
    })
  }

  public notifyRead(observedPath: string): void {
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
      const paths = this.volatileState.spiedObserversDependencies.get(spiedObserverId)
      // Path is not present, add it.
      if (!!paths && !paths.includes(observedPath)) {
        // The previous added path is a parent of this path.
        // That means that an observer is reading a nested observable property.
        // Replace the previous place, otherwise observers will "over" react.
        const previousPath = paths[paths.length - 1]
        const isChildOfPreviousPath = observedPath.includes(previousPath)

        if (isChildOfPreviousPath) {
          paths[paths.length - 1] = observedPath
        }
        // This path is not a child of the previous path.
        // The observer is reading a new path.
        else {
          paths.push(observedPath)
        }
      }
    }
  }

  private stateBackup: ContainerState

  /**
   * Run a piece of code without triggering observable
   */
  public doNotTrack(fun: () => any): any {

    this.volatileState.willReact = false
    const result = fun()
    this.volatileState.willReact = true
    return result
  }

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

    // If this step is a subsequent step of a doNotTrack function.
    if (!this.volatileState.willReact) {
      return fun()
    }

    const isPropagationMutation = this.volatileState.controlState === ControlState.STALE

    if (isPropagationMutation) {
      return fun()
    }
    /* 1 */
    // Reject if a transaction is already running
/*     if (this.state.controlState !== ControlState.READY) {
      warn('[CRAFTER] A transaction is already running')
      return
    }
 */    this.onStep(StepLifeCycle.START)
    // A new step is starting.
    // Maybe it is a nested step. Keep track of the deep level.
    this.state.nestedStepLevel++

    /* 2 */
    // Lock the model
    this.volatileState.controlState = ControlState.MUTATION
    
    // If a root step, start backup the actual container state.
    // It will use for rollback later if the step throw an error.
    if (this.state.nestedStepLevel === 0) {
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
      this.state.nestedStepLevel = 0
      this.volatileState.controlState = ControlState.READY
      if (__DEV__) {
        throw e
      }
      return
    }

    // The step presentation is finished, decrease the step level tracker.
    this.state.nestedStepLevel--

    // If it is a nested step, we don't run the learning phase
    // until the root step presentation is finished.

    if (this.state.nestedStepLevel > 0) {
      return result
    }

    // Mutation is finished, some observable may be stale.
    this.volatileState.controlState = ControlState.STALE      
   
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
    
    const staleReactions = this.getStaleReactions()
    this.onStep(StepLifeCycle.DID_PROPAGATE)
    // All computed values affected by the last observables mutation are now flagged as stale.
    // Let's run the reaction which uses those computed values.
    staleReactions.forEach(o => o.runAndUpdateDeps())

    this.volatileState.controlState = ControlState.READY

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
    onDisposeObserver(observer, this.state)
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
   * Add an updated observable reference to the list of updated observables
   * during the current transaction.
   */
  public addUpdatedObservable(observable: IObservable): void {
    if (this.volatileState.controlState === ControlState.MUTATION) {
      if (!this.volatileState.updatedObservables.includes(observable)) {
        this.volatileState.updatedObservables.push(observable)
      }
    } else {
      if (!this.volatileState.derivationUpdatedObservable.includes(observable)) {
        this.volatileState.derivationUpdatedObservable.push(observable)
      }
    }
  }

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given observer run.
   */
  public startSpyObserver({id, type}: IObserver): void {
    // Pause the current spy if any.
    this.volatileState.spyReactionQueue.push({id, type})
    this.volatileState.spiedObserversDependencies.set(id, [])
  }

  /**
   * Stop collecting observable paths and new observers for this observer
   */
  public stopSpyObserver(observerId: string): void {
    this.updateObserverDependencies(observerId)
    this.popObserverFromQueue()
  }

  private updateObserverDependencies(observerId: string) {
    const deps = this.volatileState.spiedObserversDependencies.get(observerId) ?? []
    const node = getGraphNode(observerId, this.state.observerGraph)

    if (node) {
      node.dependencies = [...deps]
    } else {
      throw new Error(`[CRAFTER] unknown observer id ${observerId} in observer graph`)
    }
  }

  private popObserverFromQueue() {
    const data = this.volatileState.spyReactionQueue.pop()
    if (data) {
      this.volatileState.spiedObserversDependencies.delete(data.id)
    }
  }

  public pauseSpies(): void {
    this.isSpyingPaused = true
  }
  
  public resumeSpies(): void {
    this.isSpyingPaused = false
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
    removeObserver({observer, dependencyGraph: this.state.observerGraph})
  }

  
  public addStepListener(lifecycle: StepLifeCycle, listener: StepListener): void {
    this.stepListeners[lifecycle].push(listener)
  }

  public removeStepListener(lifecycle: StepLifeCycle, listener: StepListener): void {
    this.stepListeners[lifecycle].splice(this.stepListeners[lifecycle].indexOf(listener), 1)
  }

  /**
   * Add migration to the current step state if mutations occured during MUTATION control state.
   */
  public addMigration(migration: Migration, rootId: string): void {
    if (this.volatileState.controlState === ControlState.MUTATION) {
      addIdToMigrationPaths(migration, rootId)
      this.state.migration = mergeMigrations(migration, this.state.migration)
    }
  }

  /**
   * Remove the parent of the given source from the graph.
   * The parent will be removed if its only dependency is the given source.
   * @param targetId 
   * @param source 
   */
  private removeObserverGraphNode(targetId: string, sourceId: string) {
    const graph = this.state.observerGraph


    const parentEdge = {
      target: targetId,
      source: sourceId
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
    return this.volatileState.spyReactionQueue[this.volatileState.spyReactionQueue.length - 1]
  }

  /**
   * Return true if this observable is an indirect dependency of the target
   * @param target 
   * @param obs 
   */
  private isIndirectTarget(target: IObserver, obs: IObservable) {
    return getAllPathsTo({
      targetId: target.id,
      graph: this.state.observerGraph
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
/*   private getStaleReactions(_ranDerivationIds: string[] = []) {   
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
      this.getStaleReactions(ranComputedIds)
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
  private getStaleReactions(): IObserver[] {
    const observers = topologicalSort(this.state.observerGraph)
      .map(id => getGraphNode(id, this.state.observerGraph))
      .map(({observer}) => observer)

    const reactions: IObserver[] = []

    observers.forEach(observer => {
        // Notify the observer that something changes.
        // If the osbserver is concerned by the change, it becomes stale.

        observer.notifyChanges([
          ...this.state.migration.forward,
          ...this.volatileState.derivationPatch
        ], [
//          HOw to pass length modification without adding it to the migration ?
          ...this.volatileState.updatedObservables.map(o=> makePath(getRoot(o as IInstance<any>).$id, o.$path)),
          ...this.volatileState.derivationPatch.map(p => p.path),
          ...this.volatileState.derivationUpdatedObservable.map(o=> makePath(getRoot(o as IInstance<any>).$id, o.$path))
        ])
        
        // Add the 
        if (isDerivation(observer)) {
          this.volatileState.derivationPatch.push(...observer.migration.forward)
        } 
        // Add the reaction if stale
        else if (isReaction(observer)) {
          reactions.push(observer)
        } 
      })

    // Retain the reactions ids to run.
    return reactions.filter(({isStale}) => isStale)
  }

  /**
   * The observable (the model) has been updated.
   * It is time to notify the derivation that something has changed.
   * We stale all the derivations which depends of the model.
   */
  private clean(): void {
    // Delete migration data
    this.state.migration.forward.length = 0
    this.state.migration.backward.length = 0
    
    // Reset volatile state
    this.volatileState.updatedObservables = []
    this.volatileState.derivationPatch = []
    this.volatileState.derivationUpdatedObservable = []
  }

  private rollback(managerStateBackup: ContainerState | undefined): void {
    const rootIds: string[] = []
    this.volatileState.updatedObservables.forEach(function (o) {
      
        const root = getRoot(toInstance(o))
        if (!rootIds.includes(root.$id)) {
          root.$type.applySnapshot(root, getSnapshot(toNode(root)))
          rootIds.push(root.$id)
        }
      
    })
    if (managerStateBackup) {
      this.state = managerStateBackup
    }
    this.clean()
    this.resumeSpies()
  }
}

/**
 * Return an observer stored in the dependencies graph.
 * Thrown if not found
 */
function getGraphNode(id: string, graph: ContainerState['observerGraph']): ObserverGraphNode {
  const child = graph
    .nodes
    .find(node => node.id === id)
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
  dependencyGraph: ContainerState['observerGraph']
}): void {
  const targetId = dependencyGraph
    .nodes
    .find(node => node.id === observer.id)?.observer.id

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
        removeNodeEdges({ nodeId: node.id, dependencyGraph })
      })
    } else {
      removeNode({node: observer, dependencyGraph})
    }
  }
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
  graph: ContainerState['observerGraph']
}): ContainerState['observerGraph'] {
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
  const graph = state.observerGraph
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
    .forEach(({observer: o}) => {
      if (observer.id !== o.id) {  
        disposeComputation(o)
        removeObserver({
          observer: o,
          dependencyGraph: graph
        })
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