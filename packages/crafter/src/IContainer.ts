import { INodeInstance } from "./lib/INodeInstance"
import { IObserver } from "./observer/Observer"
import { Graph } from "./Graph"
import { IObservable as IInstance, IObservable } from "./IObservable"
import { Operation, BasicOperation } from "./lib/JSONPatch"
import { IDerivation } from "./observer/IDerivation"

export type ContextListener = (patch: [string, BasicOperation[]][]) => void

export type State = {
  // Is writtable
  isWrittable: boolean

  // List of used ids (used for generate UID)
  uids: string[]
  observedPaths: Map<string, string[]>

  // Map of node isntances used in the container
  referencableNodeInstances: Map<string, INodeInstance<any>>

  // While running a reaction, list all derivation which are used.
  // This will be used to clean the graph from unused derivations.
  activeDerivations: Map<string, IObserver>

  // Listeners to patch event triggered after each transaction
  contextListeners: ContextListener[]

  // In the case of nested derivation, this list will stored the
  // stack of derivation ids
  spyDerivationQueue: string[]
  
  // In the case of nested running reaction, this list will stored the
  // stack of running reaction ids
  spyReactionQueue: string[]

  // Store the top level transaction ID.
  // Only the top level transaction ID will trigger the learning phase.
  // So in case of nested transaction, we need to be sure which transaction
  // has just ended.
  rootTransactionId: string | undefined

  // Flags to know at which step the new cycle is.
  // While mutating the model
  isTransaction: boolean

  // While computing new state
  // Here, the mutation can only come from the computed values setting
  // their internal state.
  isComputingNextState: boolean

  // The graph of the observers running in this container.
  dependencyGraph: Graph<IObservable | IObserver | IDerivation<any>>

  // A list of observables used during a transaction.
  // Once the transaction is complete, the manager will
  // update the derivations then the reactions which depends on them
  updatedObservables: IInstance[]
}

export interface IContainer {
  snapshot: State
  isWrittable: boolean
  isTransaction: boolean
  isRunningReaction: boolean

  /**
   * Called during the constructor of a reaction.
   * This will add the observer and its dependencies to the graph.
   */
  initReaction(reaction: IObserver): void

  /**
   * A transaction is the smallest unit of work of Crafter app.
   * This tends to be as ACID as possible. (mainly from wikipedia)
   * Atomicity: A transaction's changes to the model state are atomic: either all happen or none happen.
   * Consistency: A transaction is a correct transformation of the model state. It is the responsability of the model to accept, reject or throw to any changes.
   *  Also, the system will rollback to the previous stable state if it throws during transaction.
   * Isolation: The transaction execution is syncrhronous. It is no possible to have async command during transaction or having two transactions in the same times.
   * Durability: Once a transaction completes successfully, its changes are saved as patch (with rollback/forward command list) and a snapshot of the new model.
   */
  transaction(fun: () => any): any

  /**
   * Callback to remove unused observer and dependencies from the state.
   */
  onDisposeObserver(observer: IObserver): void

  /**
   * aree UIDor this container
   */
  getUID(prefix?: string): string

  /**
   * Return true if this UID is free to use in the container
   */
  isUID(id: string): boolean

  /**
   * Return true if this UIS is used in the container
   */
  hasUID(id: string): boolean

  /**
   * Register this UID
   */
  useUID(id: string): void

  /**
   * Free this UID
   */
  removeUID(id: string): void

  /**
   * Add an updated observable reference to the liste of updated observables
   * during the current transaction.
   */
  addUpdatedObservable(observable: IInstance): void

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given reaction id run.
   */
  startSpyReaction(reactionId: string): void
  /**
   * Stop to collect observable paths and new observers for this reaction and
   * return the paths.
   */
  stopSpyReaction(reactionId: string): string[]

  /**
   * Start the manager to collect all observables paths for the
   * given derication id run.
   */
  startSpyDerivation(derivationId: string): void
  
  /**
   * Stop to collect observable paths and for this derivation and
   * return the paths.
   */
  stopSpyDerivation(derivationId: string): string[]
  
  pauseSpies(): void
  resumeSpies(): void
  /**
   * Register a newly observed observable to the container.
   * It will register the path and its ID will be store in the dependency graph.
   * Only deepest path will be retain. That means that the function will replace previous path
   * if it is a parent of the current path.
   * Eg1. if an observer tracks the value of /parent/childString
   * the path list will be ['/parent/childString'] and not ['/', '/parent', '/parent/childString']
   * @param observable 
   * @param path optional path. If you want to override the path of the observable.
   */
  notifyRead(observable: IInstance, path?: string): void
  blockTransaction<T>(fn: () => T): T
  getReferenceTarget<T, S = T>(id: string): INodeInstance<T, S>
  registerAsReferencable(
    id: string,
    observable: INodeInstance<any>
  ): void
  unregisterAsReferencable(id: string): void
  clearContainer(): void

  /**
   * Remove an observer and its dependencies from the state
   */
  onObserverError(observer: IObserver): void

  /**
   * Present a patch to the reactions.
   * You need to specify the ID of the observable the patch comes from.
   */
  presentPatch(patch: Operation[]): void
}