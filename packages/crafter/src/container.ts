import { toNode, getRoot, getSnapshot, unique, isUnique, toInstance, isRoot, warn, noop } from './helpers'
import { IObservable } from './IObservable'
import { Command, Migration } from './lib/JSONPatch'
import { IObserver, isObserver, isReaction, isDerivation, ObserverType } from './observer/Observer'
import { Graph, removeNode, removeNodeEdges, getGraphEdgesFrom, Edge, getAllPathsTo, getEdgesOf, hasEdge, isSameEdge, topologicalSort } from './Graph'
import { INodeInstance } from './lib/INodeInstance'
import { State, IContainer, ContextListener, ControlState, MigrationListener } from './IContainer'
import { IComputed } from "./observer/IDerivation"
import { isNode } from './lib/isNode'
import { isObservable } from './lib/observable'
import { mergeMigrations } from './utils/utils'

function getInitState(): State {
  return {
    migration: {forward: [], backward: []},
    isWrittable: true,
    controlState: ControlState.READY,
    uids: [],
    spiedObserversDependencies: new Map(),
    spyReactionQueue: [],
    referencableNodeInstances: new Map(),
    isTransaction: false,
    contextListeners: [],
    isComputingNextState: false,
    activeDerivations: new Map(),
    rootTransactionId: undefined,
    dependencyGraph: {
      nodes: [],
      edges: [],
    },
    updatedObservablesGraph: {
      nodes: [],
      edges: [],
    },
    updatedObservables: []
  }
}

export class CrafterContainer implements IContainer {
  public get snapshot(): State {
    return {
      migration: {forward: this.state.migration.forward.map(op => ({...op})), backward: this.state.migration.backward.map(op => ({...op}))},
      isWrittable: this.state.isWrittable,
      controlState: this.state.controlState,
      uids: [...this.state.uids],
      referencableNodeInstances: new Map(this.state.referencableNodeInstances),
      spiedObserversDependencies: new Map(this.state.spiedObserversDependencies),
      spyReactionQueue: [...this.state.spyReactionQueue],
      isTransaction: this.state.isTransaction,
      contextListeners: [...this.state.contextListeners],
      activeDerivations: this.state.activeDerivations,
      isComputingNextState: this.state.isComputingNextState,
      rootTransactionId: this.state.rootTransactionId,
      dependencyGraph: {
        nodes: [...this.state.dependencyGraph.nodes],
        edges: [...this.state.dependencyGraph.edges],
      },
      updatedObservablesGraph: {
        nodes: [...this.state.updatedObservablesGraph.nodes],
        edges: [...this.state.updatedObservablesGraph.edges],
      },
      updatedObservables: [...this.state.updatedObservables]
    }
  }
  public onStepStart: () => void = noop
  public onModelDidUpdate: () => void = noop
  public onModelWillRollback: () => void = noop
  public onModelDidRollback: () => void = noop
  public onChangeWillBePropagated: () => void = noop
  public onStepWillEnd: (migration: Migration) => void = noop

  public get isWrittable(): boolean {
    return this.state.controlState === ControlState.MUTATION || this.state.controlState === ControlState.STALE
  }
  
  public get isTransaction(): boolean {
    return this.state.isTransaction
  }

  public get isRunningReaction(): boolean {
    const current = this.state.spyReactionQueue[this.state.spyReactionQueue.length - 1]
    return current && isReaction(current.type)
  }

  private state: State = getInitState()
  private migrationListeners: MigrationListener[] = []
  private isSpyingPaused: boolean = false
  private get isSpying() {
    return !this.isSpyingPaused && (this.state.spyReactionQueue.length > 0)
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
      const paths = this.state.spiedObserversDependencies.get(spiedObserverId)
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

  public get isLocked(): boolean{
    return this.state.controlState === ControlState.MUTATION
  }

  /**
   * A transaction is the smallest unit of work of Crafter app.
   * This tends to be as ACID as possible. (mainly from wikipedia)
   * Atomicity: A transaction's changes to the model state are atomic: either all happen or none happen.
   * Consistency: A transaction is a correct transformation of the model state. It is the responsability of the model to accept, reject or throw to any changes.
   * Also, the system will rollback to the previous stable state if it throws during transaction.
   * Isolation: The transaction execution is syncrhronous. It is no possible to have async command during transaction or having two transactions in the same times.
   * Durability: Once a transaction completes successfully, its changes are saved as migration (with rollback/forward command list) and a snapshot of the new model.
   * 
   * A transaction begins when a proposal is presented to the model.
   * 1- the model context is locked. No proposal can be accepted as long the transaction is running.
   * 2- the model context enters the MUTATION state
   * 3- The model accepts a part or the whole proposal.
   * 4- the model context enters the STALE state.
   * 5- the model context enters the READY state
   * 6- the modem context is unlocked
   */
  public transaction(fun: () => any): any {
    /* 1 */
    // Reject if a transaction is already running
    if (this.state.controlState !== ControlState.READY) {
      warn('[CRAFTER] A transaction is already running')
      return
    }
    this.onStepStart()
    /* 2 */
    // Lock the model
    this.state.controlState = ControlState.MUTATION
    
    const managerStateBackup = ControlState.READY ? this.snapshot : undefined

    let result: any
    /* 3 */
    // Proposal presentation.
    // The mutation function is passed down to the model.
    // If it throws, the system will rollback to a stable version
    try {
      this.pauseSpies()
      result = fun()
      this.resumeSpies()
      this.onModelDidUpdate()
    } catch (e) {
      this.onModelWillRollback()
      this.rollback(managerStateBackup)
      this.onModelDidRollback()
      this.resumeSpies()
      this.state.controlState = ControlState.READY
      if (__DEV__) {
        throw e
      }
      return
    }

    // Mutation is finished, some observable may be stale.
    this.state.controlState = ControlState.STALE      
   
    this.onChangeWillBePropagated()
    // Invalidate snapshot.
    // Their next computation will be triggered lazily.
    this.state.updatedObservables.forEach((o: IObservable) => {
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
    })

    // LEARNING PHASE
    // The observable has been updated.
    // It is time to notify the derivation that something has changed.
    
    this.propagateChange()
            
    this.onStepWillEnd(this.state.migration)

    this.clean()

    // All computed values affected by the last observables mutation are now flagged as stale.
    // Let's run the reaction which uses those computed values.
    this.runStaleReactions()

    this.state.controlState = ControlState.READY

    // CLEANING PHASE
    // Reset the state to get ready for a new step
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
   * Add an updated observable reference to the liste of updated observables
   * during the current transaction.
   */
  public addUpdatedObservable(observable: IObservable): void {
    // This is why we need a map for updatedObservables list.
    // It is quicker to look up with Map.has instead of Array.find
    if (!this.state.updatedObservables.includes(observable) && this.state.isTransaction) {
      this.state.updatedObservables.push(observable)
    }
  }

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given observer run.
   */
  public startSpyObserver({id, type}: IObserver): void {
    // Pause the current spy if any.
    this.state.spyReactionQueue.push({id, type})
    this.state.spiedObserversDependencies.set(id, [])
  }

  /**
   * Stop to collect observable paths and new observers for this observer
   */
  public stopSpyObserver(observerId: string): void {
    // Remove the observer id from the queue
    const data = this.state.spyReactionQueue.splice(
      this.state.spyReactionQueue.findIndex(({id}) => id === observerId),
      1
    )[0]
    data && this.state.spiedObserversDependencies.delete(data.id)
  }

  public getCurrentSpyedObserverDeps(observerId: string): string[] {
    const deps = this.state.spiedObserversDependencies.get(observerId) 
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
    removeObserver({observer, dependencyGraph: this.state.dependencyGraph})
  }

  
  public addMigrationListener(listener: MigrationListener): void {
    this.migrationListeners.push(listener)
  }

  public removeTransactionMigrationListener(listener: MigrationListener): void {
    this.migrationListeners.splice(this.migrationListeners.indexOf(listener), 1)
  }

  public addMigration(migration: Migration): void {
    mergeMigrations(migration, this.state.migration)
  }

  /**
   * Remove the parent of the given source from the graph.
   * The parent will be removed if its only dependency is the given source.
   * @param targetId 
   * @param source 
   */
  private removeParentDependency(targetId: string, source: IObservable) {
    const graph = this.state.dependencyGraph


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
  private addDependency(targetId: string, source: IObservable | IComputed<any>): void {
    // Add to the graph
    const graph = this.state.dependencyGraph
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

  private getCurrentSpiedObserverId(): {type: ObserverType, id: string} | undefined{
    // Derivation are prioritary because the always run as a child
    // So let's see if a derivation is running. If not, fallback to the last running reaction.
    return this.state.spyReactionQueue[this.state.spyReactionQueue.length - 1]
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
    const target = this.getCurrentSpiedObserverId()?.id
    if (target) {
      this.state.dependencyGraph.edges.push({
        target,
        source: observer.id
      })
    }
    this.state.dependencyGraph.nodes.push(observer)
  }

  /**
   * Return true if this observable is an indirect dependency of the target
   * @param target 
   * @param obs 
   */
  private isIndirectTarget(target: IObserver, obs: IObservable) {
    return getAllPathsTo({
      targetId: target.id,
      graph: this.state.dependencyGraph
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
   * The reactions are not run at this point.
   * The propagation is done with a topological order. That means that a derivation will
   * be tested as stale only of all its descendants are ready.
   * 1- get the topological order from the updated observables to the reaction
   * 2- run the derivation if necessary
   */
  private propagateChange() {
    topologicalSort(this.state.dependencyGraph)
    .map(id => getGraphNode(id, this.state.dependencyGraph))
    .filter(isDerivation)
    .forEach(derivation => {
      // Notify the observer. It will re run if it becomes stale.
      // If it generates an observable, the observable changes will be added
      // to the current context changes (updatedObservables), allowing the test of the next derivation.
      // We rely to the oplog to gather the stack of changes.
      derivation.notifyChanges(this.state.migration.forward, this.state.updatedObservables.map(({$path}) => $path))
    })
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
    
    // Delete updated observable
    this.state.updatedObservables = []
  }

  /**
   * Recompute observers and update dependency graph if needed
   */
  private runStaleReactions(): void {
    this.state.updatedObservables
      .map(({$id}) => getAllPathsTo({targetId: $id, graph: this.state.dependencyGraph}))
      .flatMap(paths => paths.map(path => getGraphNode(path.pop()!, this.state.dependencyGraph)))
      .filter(isObserver)
      .filter(isReaction)
      .forEach(reaction => {
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
        const root = getRoot(toInstance(o))
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
function getGraphNode(id: string, graph: Graph<IObservable | IObserver | IComputed<any>>): IObserver | IObservable {
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
function getNodeId(node: IObservable | IObserver | IComputed<any>): string {
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

function onDisposeObserver(observer: IObserver, state: State): void {
  // Get all the observers dependent of the caller.
  // An observer wich is also a dependeny on other top level observer will stay untouched.
  const graph = state.dependencyGraph
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
function invalidateSnapshot(o: INodeInstance<any>): void {
  o.$invalidateSnapshot()
  const parent = o.$parent
  if (parent) {
    invalidateSnapshot(parent)
  }
}