import { AcceptorFactory, Mutation } from "../lib/api/acceptor";
import { Actions, PackagedActions } from "../lib/api/action";
import { ActionComposer } from "../lib/api/composer";
import { ToLiteral } from "../lib/api/helpers.type";
import { CSPredicate } from "../lib/api/predicate";
import { StepReaction } from "../lib/api/stepReaction";
import { Transformation } from "../lib/api/transformer";
import { ContainerFactory, ContainerOption } from "../lib/container";

export interface IContainerFactory<
  TYPE,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = TYPE
> {
  addAcceptor<N extends string, M extends AcceptorFactory<TYPE, any>>(
    name: N,
    acceptorFactory: M
  ): IContainerFactory<
    TYPE,
    Exclude<
      | MUTATIONS
      | {
          type: N;
          payload: Parameters<ReturnType<M>["mutator"]>[0];
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
  addTransformation<C extends Transformation<TYPE>>(
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
  ): {
    controlStates: CONTROL_STATES[];
    representationRef: { current: REPRESENTATION };
    actions: ACTIONS;
    compose(composer: ActionComposer<ACTIONS, MUTATIONS>): void;
  };
}

export function createContainer<T>(options?: ContainerOption): IContainerFactory<T> {
  return new ContainerFactory<any>(options) as any;
}
