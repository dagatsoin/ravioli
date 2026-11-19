import { Acceptor, Mutation } from "../lib/api/acceptor";
import { Actions, ActionDeclarations } from "../lib/api/action";
import { AttemptCall, Compose } from "../lib/api/composer";
import { ToLiteral } from "../lib/api/helpers.type";
import { ControlStatePredicate } from "../lib/api/predicate";
import { StepReaction } from "../lib/api/stepReaction";
import { StaticTransformation, Transformation } from "../lib/api/transformer";
import { Attempt } from "../lib/api/rejection";
import { Step } from "../lib/api/presentable";
import { Factory, ContainerOption } from "../lib/container";

export interface ContainerFactory<
  /**
   * The internal type of the model
   */
  MODEL,
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
  REPRESENTATION = MODEL
> {
  addAcceptor<N extends string, M extends Acceptor<MODEL, any>>(
    name: N,
    acceptor: M
  ): ContainerFactory<
    MODEL,
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
    >,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  >;
  /**
   * Declare a control state: the predicate says, after each step, whether the
   * model is in it.
   */
  addControlState<I extends string>(
    id: I,
    predicate: ControlStatePredicate<MODEL, MUTATIONS, CONTROL_STATES | ToLiteral<I>>
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES | ToLiteral<I>>;
  /**
   * @deprecated Renamed `addControlState` in 1.8. It does the same.
   */
  addControlStatePredicate<I extends string>(
    id: I,
    predicate: ControlStatePredicate<MODEL, MUTATIONS, CONTROL_STATES | ToLiteral<I>>
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES | ToLiteral<I>>;
  addActions<P extends ActionDeclarations<CONTROL_STATES, MUTATIONS>>(
    actions: P
  ): ContainerFactory<
    MODEL,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS | Actions<CONTROL_STATES, MUTATIONS, P>,
    REPRESENTATION
  >;
  /**
   * Set the representation: what the transformation returns, derived again
   * from the model and the control states after each step. It is the one the
   * container shows instead of the model.
   */
  setRepresentation<C extends Transformation<MODEL, CONTROL_STATES>>(
    transformer: C
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, ReturnType<C>>;
  /**
   * @deprecated Renamed `setRepresentation` in 1.8. It does the same.
   */
  addTransformation<C extends Transformation<MODEL, CONTROL_STATES>>(
    transformer: C
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, ReturnType<C>>;
  /**
   * Set a static representation: what the transformation returns, computed
   * once when the container is created, given the model and the actions.
   */
  setStaticRepresentation<C extends StaticTransformation<MODEL, ACTIONS>>(
    transformer: C
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, ReturnType<C>>;
  /**
   * @deprecated Renamed `setStaticRepresentation` in 1.8. It does the same.
   */
  addStaticTransformation<C extends StaticTransformation<MODEL, ACTIONS>>(
    transformer: C
  ): ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, ReturnType<C>>;
  addStepReaction<
    I extends string,
    R extends StepReaction<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>
  >(args: StepReaction<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>): ContainerFactory<
    MODEL,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  >;
  create(
    initialValue: MODEL,
    options?: ContainerOption
  ): Container<
    MODEL,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  >
  /**
   * For typing only.
   * @throws Don't try to access this property.
   */
  Mutations: MUTATIONS
}

/**
 * @deprecated Renamed `ContainerFactory` in 1.8. The same type.
 */
export type IContainerFactory<
  MODEL,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = MODEL
> = ContainerFactory<MODEL, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>;

export function createContainer<T>(): ContainerFactory<T> {
  return new Factory<any>() as any;
}

/**
 * A container: what `create` makes.
 */
export interface Container<
  MODEL,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = MODEL
> {
  /**
   * The current control states of the given step. It is a Mobx reactive array.
   */
  controlStates: CONTROL_STATES[];
  /**
   * The current representation synchronised with the model.
   * It is a reactive object and you can use it in any MobX based
   * front end. It is the model itself when no representation was set.
   */
  readonly representation: REPRESENTATION;
  /**
   * @deprecated Read `representation` instead, since 1.8:
   * `representationRef.current` is the same object.
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
   * The outcome of the last presented proposal, accepted or not.
   * Undefined until the first attempt.
   *
   * It is a MobX observable, so you can render a refusal reactively. A refused
   * proposal does not start a step: no step id increment, no step reaction.
   *
   * This is a receipt for one attempt, not the error state of your app. An error
   * which must stay on screen is data and belongs to the model, through an acceptor.
   */
  lastAttempt: Attempt<MUTATIONS> | undefined;
  /**
   * Jump to another step. The model data is reconciled in place, so the
   * observers stay attached, then the step reactions replay against the
   * reinjected delta.
   */
  restore(step: Step<MODEL, MUTATIONS, CONTROL_STATES>): void;
  /**
   * @deprecated Renamed `restore` in 1.8. The same function.
   */
  rollback(step: Step<MODEL, MUTATIONS, CONTROL_STATES>): void;
  /**
   * Put the container back to its creation step. Give the data it was created
   * with: the container does not keep a copy of it.
   */
  reset(data: MODEL): void;
  /**
   * Compose multiple actions in one proposal.
   * The first argument of the composer callback is the current available actions.
   * The given callback should return an array of proposal.
   */
  compose: Compose<ACTIONS, MUTATIONS>
  /**
   * Present a proposal and get the outcome of that very attempt, where
   * `lastAttempt` only holds the last one, whoever made it.
   *
   * Call an action on it as on `actions`, `attempt.heal(5)`, or give it a
   * composer as `compose` takes. The promise resolves once the attempt is final: at once when the
   * proposal is rejected or discarded, after the reactions of the step and the
   * steps they started when it is accepted. Read `settled`, `reason` and
   * `undone` on an accepted attempt to know how they went.
   *
   * A refusal is an outcome: the promise only rejects when the action, an
   * acceptor or a control state predicate throws.
   *
   * Do not await it from a step reaction which is awaited itself, when the
   * proposal has to wait for that reaction: its own container, or another one
   * whose awaited reactions wait for this one.
   */
  attempt: AttemptCall<ACTIONS, MUTATIONS>
}

/**
 * @deprecated Renamed `Container` in 1.8, which has `attempt`,
 * `representation` and `restore` too. Kept as it was, so that an `IInstance`
 * written by hand, a test double for example, is still one.
 */
export interface IInstance<
  MODEL,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = MODEL
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
   * The outcome of the last presented proposal, accepted or not.
   * Undefined until the first attempt.
   *
   * It is a MobX observable, so you can render a refusal reactively. A refused
   * proposal does not start a step: no step id increment, no step reaction.
   *
   * This is a receipt for one attempt, not the error state of your app. An error
   * which must stay on screen is data and belongs to the model, through an acceptor.
   */
  lastAttempt: Attempt<MUTATIONS> | undefined;
  /**
   * Jump to another step. The model data is reconciled in place, so the
   * observers stay attached, then the step reactions replay against the
   * reinjected delta.
   */
  rollback(step: Step<MODEL, MUTATIONS, CONTROL_STATES>): void;
  /**
   * Put the container back to its creation step. Give the data it was created
   * with: the container does not keep a copy of it.
   */
  reset(data: MODEL): void;
  /**
   * Compose multiple actions in one proposal.
   * The first argument of the composer callback is the current available actions.
   * The given callback should return an array of proposal.
   */
  compose: Compose<ACTIONS, MUTATIONS>
}

/**
 * What an instance made by a container adds to `IInstance`. It is apart so
 * that an `IInstance` written by hand before it existed is still one.
 *
 * @deprecated Part of `Container` since 1.8.
 */
export interface IAttempt<ACTIONS, MUTATIONS> {
  /**
   * Present a proposal and get the outcome of that very attempt, where
   * `lastAttempt` only holds the last one, whoever made it.
   *
   * Call an action on it as on `actions`, `attempt.heal(5)`, or give it a
   * composer as `compose` takes. The promise resolves once the attempt is final: at once when the
   * proposal is rejected or discarded, after the reactions of the step and the
   * steps they started when it is accepted. Read `settled`, `reason` and
   * `undone` on an accepted attempt to know how they went.
   *
   * A refusal is an outcome: the promise only rejects when the action, an
   * acceptor or a control state predicate throws.
   *
   * Do not await it from a step reaction which is awaited itself, when the
   * proposal has to wait for that reaction: its own container, or another one
   * whose awaited reactions wait for this one.
   */
  attempt: AttemptCall<ACTIONS, MUTATIONS>
}

// Registry functions for JSON-based container creation
export {
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction,
  clearRegistry,
  getAcceptor,
  getControlStatePredicate,
  getAction,
  getStepReaction
} from './fromJSON/registry';

// JSON factory functions
export { createContainerFromJSON } from './fromJSON/containerFromJSON';

// Configuration type for JSON-based containers
export type { ContainerConfig } from './fromJSON/containerConfig';

// Step types
export type { Delta, Proposal, Step, StepDelta, TaggedProposal } from '../lib/api/presentable';

// What the factory is given
export type { ActionDeclaration, ActionDeclarations, ActionOptions } from '../lib/api/action';
export type { ControlStatePredicate } from '../lib/api/predicate';

// Rejection types
export type { Attempt, Reason, Rejection } from '../lib/api/rejection';
export { ReasonCode, RejectionCode } from '../lib/api/rejection';


// The patches of a step, and what reads them
export type { Patch, PatchOperation } from '../lib/api/patch';
export { applyPatch, jsonCopy } from '../lib/jsonPatch';