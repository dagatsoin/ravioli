import { INodeInstance } from "./lib/INodeInstance"
import { IObserver, ObserverType } from "./observer/IObserver"
import { Graph } from "./Graph"
import { IObservable as IInstance, IObservable } from "./IObservable"
import { Command, BasicCommand, Migration } from "./lib/JSONPatch"
import { IDerivation } from "./observer/IDerivation"

export type StepListener = (context: IContainer) => void

export enum StepLifeCycle {
  START = 'START',
  DID_UPDATE = 'DID_UPDATE',
  WILL_ROLL_BACK = 'WILL_ROLL_BACK',
  DID_ROLL_BACK = 'DID_ROLL_BACK',
  WILL_PROPAGATE = 'WILL_PROPAGATE',
  WILL_END = 'WILL_END',
  DID_PROPAGATE = "DID_PROPAGATE"
}

export enum ControlState {
  READY,
  MUTATION,
  STALE,
}

export type ObserverGraphNode = {
  id: string
  observer: IObserver | IDerivation<any>, 
  dependencies: string[]
}

export type ContainerState = {
  // The migration for the current step
  migration: Migration

  // List of used ids (used for generate UID)
  uids: string[]

  // Map of node isntances used in the container
  referencableNodeInstances: Map<string, INodeInstance<any>>

  // While running a reaction, list all derivation which are used.
  // This will be used to clean the graph from unused derivations.
  activeDerivations: Map<string, IObserver>

  // Store the top level step ID.
  // Only the top level step ID will trigger the learning phase.
  // So in case of nested step, we need to be sure which step
  // has just ended.
//  rootTransactionId: string | undefined

  // Keep tracks of the nested step.
  // If this counter goes back to 0, that means that the root
  // step is ended
  nestedStepLevel: number
  
  // The graph of the active observers and its dependencies.
  observerGraph: Graph<ObserverGraphNode>
}

export type Proposal = BasicCommand[]

export interface IContainer {
  snapshot: ContainerState
  isWrittable: boolean
//  isTransaction: boolean
  isRunningReaction: boolean
  controlState: ControlState

  /**
   * Return the paths of the observables used (read) by an observer
   */
  getObserverDeps(observerId: string): string[]

  /**
   * Add an observer to the observer graph
   */
  registerObserver(observer: IObserver): void

  /**
   * A step is the smallest unit of work of Crafter app.
   * Separation of concern: It is the responsability of the model to accept, reject or throw to any part of the proposal.
   * The commands passed to the step are not guarantee to success. It is just a proposal.
   * Consistency: the system will rollback to the previous stable state if it throws during step.
   * Isolation: The step execution is syncrhronous. It is no possible to have async command during step or having two steps in the same times.
   * Time based: Once a step completes successfully, its changes are propagated into the context for dependencies to react on.
   * Also the previous snapshot being immutable, a new snapshot is computed. 
   */
  step(fun: () => any): any

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
   * during the current step.
   */
  addUpdatedObservable(observable: IInstance): void

  /**
   * Start to collect all observables paths and derivations
   * poping out during the given observer run.
   */
  startSpyObserver(observer: IObserver): void

  /**
   * Stop to collect observable paths and for this observer
   */
  stopSpyObserver(observerId: string): void
  
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
  notifyRead(path?: string): void
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
   * Present a migration to the reactions.
   * You need to specify the ID of the observable the migration comes from.
   */
  presentPatch(migration: Command[]): void

  /**
   * Add some operations to the current step migration
   */
  addMigration(migration: Migration, observableId: string): void
  
  /**
   * Add a listener which will be called at the given life cycle.
   */
  addStepListener(lifecycle: StepLifeCycle, listener: StepListener): void

  /**
   * Remove the given listener at the the given life cycle.
   */
  removeStepListener(lifecycle: StepLifeCycle, listener: StepListener): void
}