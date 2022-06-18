import { IObservable, IObservableArray, observable, runInAction } from "mobx";
import { IContainerFactory, IInstance } from "..";
import {
  Acceptor,
  Mutation,
  MutationName
} from "./api/acceptor";
import {
  ActionContext,
  ActionPackage,
  ConfigurableAction,
  PackagedActions,
  SyncAction
} from "./api/action";
import { ActionComposer } from "./api/composer";
import { ToLiteral } from "./api/helpers.type";
import { CSPredicate } from "./api/predicate";
import {
  IProposalBuffer,
  Proposal,
  SAMLoop,
  TaggedProposal
} from "./api/presentable";
import { Instance } from "./instance"
import { StepReaction } from "./api/stepReaction";
import { Transformation } from "./api/transformer";
import { getControlStates } from "./controlState";
import { derivate } from "./derivate";
import { createNAPProposalBuffer } from "./proposalBuffer";

export interface ContainerOption {
  /**
   * Work only for custom representation.
   * Will debounce the reaction to the representation update
   * until all step reactions are handled.
   */
  debounceReaction?: boolean;
  /**
   * @deprecated if no control state is found, return the previous.
   * 
   * This params is deprecated and will be removed in the future.
   */
  keepLastControlStateIfUndefined?: boolean
}

export class ContainerFactory<
  TYPE,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
  CONTROL_STATES extends string = never,
  ACTIONS = never,
  REPRESENTATION = TYPE
> implements
    IContainerFactory<
      TYPE,
      MUTATIONS,
      CONTROL_STATES,
      ACTIONS,
      REPRESENTATION
    > {
  
      
  public acceptors: Record<
    string,
    {
      condition?: (model: TYPE) => boolean;
      mutator: (model: TYPE, payload: any) => void;
    }
    > = {};
  public controlStatePredicates: Array<
    [CONTROL_STATES, CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>]
  > = [];
  public transformer?: Transformation<TYPE>;
  public stepReactions: Array<{
    name: string;
    reaction: StepReaction<any, any, any, any>;
  }> = [];
  public wrapedActions: Record<keyof PackagedActions<CONTROL_STATES, MUTATIONS>, (instance: IInstance<any, any, any, any, any> & SAMLoop) => ActionPackage<ActionContext<CONTROL_STATES>, MUTATIONS>> = {};
  public originalActions: PackagedActions<CONTROL_STATES, MUTATIONS> = {};

  private packagedActions: PackagedActions<CONTROL_STATES, MUTATIONS> = {};

  constructor() {}

  addAcceptor<N extends string, M extends Acceptor<TYPE, any>>(
    name: N,
    acceptor: M
  ): any {
    if (this.acceptors[name]) {
      throw new Error(
        `This component has already an acceptor bound to ${name}`
      );
    }
    this.acceptors[name] = acceptor
    return this;
  }

  addControlStatePredicate<I extends string>(
    id: I,
    predicate: CSPredicate<TYPE, MUTATIONS, CONTROL_STATES | ToLiteral<I>>
  ): any {
    if (this.controlStatePredicates.some(([_id]) => (id as any) === _id)) {
      throw new Error(
        `This component has already a control state called ${id}`
      );
    }
    this.controlStatePredicates.push([id as any, predicate as any]);
    return this;
  }

  addActions<P extends PackagedActions<CONTROL_STATES, MUTATIONS>>(
    actions: P
  ): any {
    this.originalActions = {};
    this.packagedActions = { ...this.packagedActions, ...actions };
    this.wrapedActions = {};
    Object.keys(this.packagedActions).map((k) => {
      const actionPackage = this.packagedActions[k];

      if (isMutationShortcut<MUTATIONS>(actionPackage)) {
        // The action is just a shortcut to an acceptor with the same name.
        // Wrap the acceptor mutator in an synchronous action.
        const action = (payload: any): Mutation<any, any>[] => [
          { type: actionPackage, payload },
        ];
        this.originalActions[k] = action;
        this.wrapedActions[k] = toSyncAction(
          k,
          (payload: any): Mutation<any, any>[] => [
            { type: actionPackage, payload },
          ]
        );
      } else if (isSyncAction(actionPackage)) {
        this.originalActions[k] = actionPackage;
        this.wrapedActions[k] = toSyncAction(
          k,
          actionPackage
        );
      } else if (isConfigurableAction(actionPackage)) {
        this.originalActions[k] = actionPackage.action;
        this.wrapedActions[k] = actionPackage.isAsync
          ? actionPackage.isCancelable
            ? toCancelableAsyncAction(
                actionPackage.action,
                actionPackage.isAllowed as any
              )
            : toAsyncAction(
                k,
                actionPackage.action,
                actionPackage.isAllowed as any
              )
          : toSyncAction(
              k,
              actionPackage.action,
              actionPackage.isAllowed as any
            );
      }
    });
    return this;
  }

  addTransformation<C extends Transformation<TYPE>>(transformer: C): any {
    this.transformer = transformer;
    return this;
  }

  addStepReaction(
    name: string,
    reaction: StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS>
  ): any {
    this.stepReactions.push({ name, reaction });
    return this;
  }

  create(
    initialValue: TYPE,
    options?: ContainerOption
  ): {
    controlStates: CONTROL_STATES[];
    representationRef: { current: REPRESENTATION };
    actions: ACTIONS;
    compose(composer: ActionComposer<ACTIONS, MUTATIONS>): void;
  } {
    const instance = new Instance(initialValue, this, options)

    return {
      actions: instance.actions,
      controlStates: instance.controlStates,
      representationRef: instance.representationRef,
      compose: instance.compose,
    };
  }
}

function isSyncAction(
  actionPackage: ActionPackage<any, any>
): actionPackage is SyncAction<any> {
  return typeof actionPackage === "function";
}

function isConfigurableAction(
  actionPackage: ActionPackage<any, any>
): actionPackage is ConfigurableAction<any, any> {
  return typeof actionPackage === "object";
}

function isMutationShortcut<M extends Mutation<any, any>>(
  actionPackage: ActionPackage<any, M>
): actionPackage is MutationName<M> {
  return typeof actionPackage === "string";
}



function toSyncAction<A extends (...args: any[]) => any>(
  name: string,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return function(instance: IInstance<any, any, any, any> & SAMLoop) {
      return function (...args: Parameters<A>): Proposal<any> | undefined {
          // Check auth
          if (authPredicate) {
              if (!authPredicate({ controlStates: instance.controlStates })) {
              console.warn(
                  `Unauthorized action ${name} at step ${instance.stepId} with control states: ${instance.controlStates}`
              );
              return;
              }
          }
          const proposal: TaggedProposal = Object.assign(action(...args), {
              stepId: instance.stepId,
          });
          instance.startStep(proposal);
      }
  }
}


/**
* Used when an action call and its proposal presentation occurs at different steps.
* Eg. Fetching some data
*/
function toAsyncAction<A extends (...args: any[]) => any>(
  name: string,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return function(instance: IInstance<any, any, any, any> & SAMLoop) {
      return async function (...args: Parameters<A>): Promise<void> {
      // Check auth
      if (authPredicate) {
          if (!authPredicate({ controlStates: instance.controlStates })) {
          console.warn(
              `Unauthorized action ${name} at step ${instance.stepId} with control states: ${instance.controlStates}`
          );
          return;
          }
      }
      const proposal: TaggedProposal = Object.assign(await action(...args), {
          stepId: instance.stepId,
      });
      // Check auth again
      // Maybe the app as reached a step where this action is
      // no more allowed
  
      if (authPredicate) {
          if (!authPredicate({ controlStates: instance.controlStates })) {
          console.warn(
              `Unauthorized action ${name} at step ${instance.stepId} with control states: ${instance.controlStates}`
          );
          return;
          }
      }
      instance.startStep(proposal);
      };
  }
}

/**
 * Used when more than a mix of sync and async action can occurs during a step. The one which first presents its proposal wins.
 * Eg.
 *   Actions.asyncSave()
 *   // Waiting for save... Ho no, a typo!
 *   Actions.syncCancel() <-- this one will present its proposal first, the proposal of asyncSave will be ignored.
 */
function toCancelableAsyncAction<A extends (...args: any[]) => any>(
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return function(instance: IInstance<any, any, any, any> & SAMLoop) {
      return async function (...args: Parameters<A>): Promise<void> {
      // Check auth
      if (authPredicate) {
          if (!authPredicate({ controlStates: instance.controlStates })) {
          console.warn(
              `Unauthorized action ${name} at step ${instance.stepId} with control states: ${instance.controlStates}`
          );
          return;
          }
      }
      // Preserve the step id during which the action call occured.
      // It will be used to determinate, after the action resolving, if this proposal is still valid.
      const stepId = instance.stepId;
      const proposal: TaggedProposal = Object.assign(await action(...args), {
          stepId,
      });
      instance.startStep(proposal);
      };
  }
}