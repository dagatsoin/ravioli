import { Mutation, MutationName } from "./acceptor";
import { Proposal } from "./presentable";

export enum ActionType {
  update = "update",
}

export type Intent<P> = {
  type: ActionType;
  payload: P;
};

export type Action<MUTATION extends Mutation<any, any> = any> =
  | SyncAction<MUTATION>
  | AsyncAction<MUTATION>;

export type SyncAction<MUTATION extends Mutation<any, any>> = (
  payload?: any
) => Proposal<MUTATION>;

export type AsyncAction<MUTATION extends Mutation<any, any>> = (
  payload?: any
) => Promise<Proposal<MUTATION>>;

export type ActionIntent = (payload: any) => void;

export type PackagedActions<
  CONTROL_STATES,
  MUTATION extends Mutation<any, any>
> = {
  [key: string]: ActionPackage<ActionContext<CONTROL_STATES>, MUTATION>;
};

export type ActionContext<CONTROL_STATES = unknown> = {
  controlStates: CONTROL_STATES[];
};

export type StepContext<
  MODEL = unknown,
  MUTATION = unknown,
  CONTROL_STATES = unknown
> = {
  model: MODEL;
  acceptedMutations: MUTATION;
  controlState: CONTROL_STATES;
  previousControlState: CONTROL_STATES;
};

export type ConfigurableAction<
  ACTION_CONTEXT extends ActionContext,
  MUTATION extends Mutation<any, any>
> = {
  isAllowed?: (actionContext: ACTION_CONTEXT) => boolean;
  isCancelable?: boolean;
  isAsync?: boolean;
  action: Action<MUTATION>;
};

export type ActionPackage<
  ACTION_CONTEXT extends ActionContext,
  MUTATION extends Mutation<any, any>
> =
  | ConfigurableAction<ACTION_CONTEXT, MUTATION> // An action with a auth function to register it during the current step
  | SyncAction<MUTATION> // Just the action
  | MutationName<MUTATION>; // A mutation name to bind it directly

export type Actions<
  CONTROL_STATES,
  MUTATION extends Mutation<any, any>,
  I extends PackagedActions<CONTROL_STATES, MUTATION>
> = {
  [key in keyof I]: I[key] extends SyncAction<any>
    ? I[key]
    : I[key] extends ConfigurableAction<any, any>
    ? I[key]["action"]
    : // The action is the name of an acceptor.
    I[key] extends MUTATION["type"]
    ? // Generate a function which takes the mutator payload if any
      Extract<MUTATION, { type: I[key] }>["payload"] extends undefined
      ? () => Proposal<Extract<MUTATION, { type: I[key] }>>
      : (
          payload: Extract<MUTATION, { type: I[key] }>["payload"]
        ) => Proposal<MUTATION>
    : never;
};
