import { Mutation, MutationName } from "./acceptor";
import { Proposal } from "./presentable";

export type Action<MUTATIONS extends Mutation<any, any> = any> =
  | SyncAction<MUTATIONS>
  | AsyncAction<MUTATIONS>;

export type SyncAction<MUTATIONS extends Mutation<any, any>> = (
  payload?: any
) => Proposal<MUTATIONS>;

export type AsyncAction<MUTATIONS extends Mutation<any, any>> = (
  payload?: any
) => Promise<Proposal<MUTATIONS>>;

/**
 * @deprecated Nothing uses it, and it has no replacement. It is removed in
 * the next major version.
 */
export type ActionIntent = (payload: any) => void;

/**
 * The actions given to `addActions`, by name.
 */
export type ActionDeclarations<
  CONTROL_STATES,
  MUTATIONS extends Mutation<any, any>
> = {
  [key: string]: ActionDeclaration<ActionContext<CONTROL_STATES>, MUTATIONS>;
};

/**
 * @deprecated Renamed `ActionDeclarations` in 1.9. The same type.
 */
export type PackagedActions<
  CONTROL_STATES,
  MUTATIONS extends Mutation<any, any>
> = ActionDeclarations<CONTROL_STATES, MUTATIONS>;

export type ActionContext<CONTROL_STATES = unknown> = {
  controlStates: CONTROL_STATES[];
};

/**
 * @deprecated Nothing uses it, and it has no replacement: a step reaction is
 * given a `StepDelta`. It is removed in the next major version.
 */
export type StepContext<
  MODEL = unknown,
  MUTATIONS = unknown,
  CONTROL_STATES = unknown
> = {
  data: MODEL;
  acceptedMutations: MUTATIONS;
  controlState: CONTROL_STATES;
  previousControlState: CONTROL_STATES;
};

/**
 * An action with its options: when it is allowed, whether it is asynchronous,
 * and whether a later proposal cancels it.
 */
export type ActionOptions<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> = {
  isAllowed?: (actionContext: ACTION_CONTEXT) => boolean;
  isCancelable?: boolean;
  isAsync?: boolean;
  action: Action<MUTATIONS>;
};

/**
 * @deprecated Renamed `ActionOptions` in 1.9. The same type.
 */
export type ConfigurableAction<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> = ActionOptions<ACTION_CONTEXT, MUTATIONS>;

/**
 * One action given to `addActions`.
 */
export type ActionDeclaration<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> =
  | ActionOptions<ACTION_CONTEXT, MUTATIONS> // An action with its options, when it is allowed for example
  | SyncAction<MUTATIONS> // Just the action
  | MutationName<MUTATIONS>; // A mutation name to bind it directly

/**
 * @deprecated Renamed `ActionDeclaration` in 1.9. The same type.
 */
export type ActionPackage<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> = ActionDeclaration<ACTION_CONTEXT, MUTATIONS>;

export type Actions<
  CONTROL_STATES,
  MUTATIONS extends Mutation<any, any>,
  I extends ActionDeclarations<CONTROL_STATES, MUTATIONS>
> = {
  [key in keyof I]: I[key] extends SyncAction<any>
    ? I[key]
    : I[key] extends ActionOptions<any, any>
    ? I[key]["action"]
    : // The action is the name of an acceptor.
    I[key] extends MUTATIONS["type"]
    ? // Generate a function which takes the mutator payload if any
      Extract<MUTATIONS, { type: I[key] }>["payload"] extends undefined
      ? () => Proposal<Extract<MUTATIONS, { type: I[key] }>>
      : (
          payload: Extract<MUTATIONS, { type: I[key] }>["payload"]
        ) => Proposal<MUTATIONS>
    : never;
};
