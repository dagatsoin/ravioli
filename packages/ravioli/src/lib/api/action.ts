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

export type ActionIntent = (payload: any) => void;

export type PackagedActions<
  CONTROL_STATES,
  MUTATIONS extends Mutation<any, any>
> = {
  [key: string]: ActionPackage<ActionContext<CONTROL_STATES>, MUTATIONS>;
};

export type ActionContext<CONTROL_STATES = unknown> = {
  controlStates: CONTROL_STATES[];
};

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

export type ConfigurableAction<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> = {
  isAllowed?: (actionContext: ACTION_CONTEXT) => boolean;
  isCancelable?: boolean;
  isAsync?: boolean;
  action: Action<MUTATIONS>;
};

export type ActionPackage<
  ACTION_CONTEXT extends ActionContext,
  MUTATIONS extends Mutation<any, any>
> =
  | ConfigurableAction<ACTION_CONTEXT, MUTATIONS> // An action with a auth function to register it during the current step
  | SyncAction<MUTATIONS> // Just the action
  | MutationName<MUTATIONS>; // A mutation name to bind it directly

export type Actions<
  CONTROL_STATES,
  MUTATIONS extends Mutation<any, any>,
  I extends PackagedActions<CONTROL_STATES, MUTATIONS>
> = {
  [key in keyof I]: I[key] extends SyncAction<any>
    ? I[key]
    : I[key] extends ConfigurableAction<any, any>
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
