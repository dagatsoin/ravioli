import { Actions, PackagedActions } from './Action'
import {
  AcceptorFactory,
  PredicateFunction,
  Reaction,
  Transformation,
  RepresentationPredicate,
} from './IComponentFactory'
import { Proposal } from './IPresentable'
import { Mutation } from './Acceptor'

export interface IComponentInstance<
  TYPE,
  REPRESENTATION,
  ACTIONS extends Actions<any, any, any>,
  MUTATIONS extends Mutation<any, any>
> {
  readonly Type: TYPE
  readonly state: State<REPRESENTATION>
  readonly actions: ACTIONS
  compose(composer: ActionComposer<ACTIONS, MUTATIONS>): void
}

export interface ITransformable<TRANSFORMATION> {
  transformation: TRANSFORMATION
}

export interface IActionCacheReset {
  /**
   * Force invalidation of the actions cache.
   * Use this when you add a static action is to a factory
   * on its instances to make them aware of the new action.
   */
  rebuildActionsCache(): void
}

/**
 * Interface to customize component instance on the fly.
 * Used internally to make decorators on specific instance (eg: heal buff)
 */
export interface IEnhancabble {
  addAcceptor(acceptorName: string, acceptorFactory: AcceptorFactory<any>): void
  removeAcceptor(acceptorName: string): void
  addActions(packagedActions: PackagedActions<any, any>): void
  removeAction(actionName: string): void
  removeNAP(NAPName: string): void
  addControlStatePredicate(
    id: string,
    predicate: PredicateFunction<any, any, any>
  ): void
  removeControlStatePredicate(id: string): void
  addStepReaction(id: string, nap: Reaction<any, any, any, any>): void
  setTransformation(id: string, transformation: Transformation<any> | {
    predicate?: RepresentationPredicate<any, any, any>
    computation: Transformation<any>
  }): void
  removeTransformation(id: string): void
}

type ActionComposer<ACTIONS, MUTATIONS> = (
  actions: ACTIONS
) => Proposal<MUTATIONS>[]

export type State<
  REPRESENTATION,
  CONTROL_STATE extends string = string
> = {
  stepId: string
  readonly representation: REPRESENTATION
  controlStates: CONTROL_STATE[]
}
