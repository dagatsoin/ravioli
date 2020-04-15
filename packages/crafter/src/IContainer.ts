import { INodeInstance } from "./lib/INodeInstance"
import { IObserver } from "./observer/Observer"
import { Graph } from "./Graph"
import { IObservable } from "./IObservable"
import { Operation, BasicOperation } from "./lib/JSONPatch"

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

  // When a Computed value update it will $setValue on its internal observable.
  // If the new value is also an observable, it will be deep copied in the internal observable.
  // During the copy, all observable key source will be read, triggering a bunch of
  // new observed paths.
  // Those paths are not wanted here, so we need to pause the spies during this transaction.
  isSpyingDisable: boolean

  // The graph of the observers running in this container.
  dependencyGraph: Graph<IObserver>

  // A list of observables use during a transaction.
  // Once the transaction is complete, the manager will
  // alert all the concerned observers that their dependencies
  // have a new state
  updatedObservables: Map<string, IObservable>
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
   * Register a computed source to the container graph
   */
  registerComputedSource(observer: IObserver): void

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
  onDisposeObserver(targetId: string): void

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
  addUpdatedObservable(observable: IObservable): void

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
  addObservedPath(path: string): void
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
  onObserverError(observerId: string): void

  /**
   * Present a patch to the reactions.
   * You need to specify the ID of the observable the patch comes from.
   */
  presentPatch(patch: Operation[]): void
}