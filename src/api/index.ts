import { Acceptor, Mutation } from "../lib/api/acceptor";
import { Actions, PackagedActions } from "../lib/api/action";
import { ActionComposer } from "../lib/api/composer";
import { ToLiteral } from "../lib/api/helpers.type";
import { CSPredicate } from "../lib/api/predicate";
import { StepReaction } from "../lib/api/stepReaction";
import { Transformation } from "../lib/api/transformer";
import { ContainerFactory } from "../lib/container";

export interface IContainerFactory<
  /**
   * The internal type of the model
   */
  TYPE,
  /**
   * The mutations names used by this container
   */
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  /**
   * The control states names used by this container
   */
  CONTROL_STATES extends string = never,
  /**
   * All the actions used by this container.
   */
  ACTIONS = never,
  /**
   * The representation type. By default it is the model type.
   */
  REPRESENTATION = TYPE
> {
  addAcceptor<N extends string, M extends Acceptor<TYPE, any>>(
    name: N,
    acceptor: M
  ): IContainerFactory<
    TYPE,
    Exclude<
      | MUTATIONS
      | {
          type: N;
          payload: Parameters<M["mutator"]>[1];
        },
      {
        // Remove the initial parameter to have a cleaner result
        type: never;
        payload: never;
      }
    >
  >;
  addControlStatePredicate<I extends string>(
    id: I,
    predicate: CSPredicate<TYPE, MUTATIONS, CONTROL_STATES | ToLiteral<I>>
  ): IContainerFactory<TYPE, MUTATIONS, CONTROL_STATES | ToLiteral<I>>;
  addActions<P extends PackagedActions<CONTROL_STATES, MUTATIONS>>(
    actions: P
  ): IContainerFactory<
    TYPE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS | Actions<CONTROL_STATES, MUTATIONS, P>
  >;
  addTransformation<C extends Transformation<TYPE, CONTROL_STATES>>(
    transformer: C
  ): IContainerFactory<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, ReturnType<C>>;
  addStepReaction<
    I extends string,
    R extends StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS>
  >(
    name: I,
    reaction: R
  ): IContainerFactory<
    TYPE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  >;
  create(
    initialValue: TYPE
  ): IInstance<
    TYPE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  >
}

export function createContainer<T>(): IContainerFactory<T> {
  return new ContainerFactory<any>() as any;
}


export interface IInstance<
  TYPE,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = TYPE
> {
  /**
   * The current control states ofr the given step. It is a Mobx reactive array.
   */
  controlStates: CONTROL_STATES[];
  /**
   * The current representation synchronised with the model.
   * It is a reactive object and you can use it in any MobX based
   * front end.
   */
  representationRef: { current: REPRESENTATION };
  /**
   * The available action for the next step.
   */
  actions: ACTIONS;
  /**
   * The current step nonce.
   */
  stepId: number;
  /**
   * Compose multiple actions in one proposal.
   * The first argument of the composer callback is the current available actions.
   * The given callback should return an array of proposal.
   */
  compose(composer: ActionComposer<ACTIONS, MUTATIONS>): void;
}