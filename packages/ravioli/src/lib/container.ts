import { untracked } from "mobx";
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
import { ToLiteral } from "./api/helpers.type";
import { CSPredicate } from "./api/predicate";
import {
  Proposal,
  SAMLoop,
  TaggedProposal
} from "./api/presentable";
import { Origin } from "./origin";
import { Instance } from "./instance"
import { StepReaction } from "./api/stepReaction";
import { StaticTransformation, Transformation } from "./api/transformer";
import { RejectionCode } from "./api/rejection";
import { validateControlStatePredicates } from "./controlState";

export interface ContainerOption {
  /**
   * Initial step number for the container.
   * Useful for hydrating a container from persisted state.
   * Defaults to 0.
   */
  initialStepId?: number;
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
    Acceptor<TYPE, MUTATIONS>
    > = {};
  public controlStatePredicates: Array<
    [CONTROL_STATES, CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>]
  > = [];
  public transformer?: Transformation<TYPE, CONTROL_STATES>;
  public staticTransformer?: StaticTransformation<TYPE, ACTIONS>;
  public wrapedActions: Record<keyof PackagedActions<CONTROL_STATES, MUTATIONS>, (instance: IInstance<any, any, any, any, any> & SAMLoop, origin?: Origin) => (...args: any) => unknown> = {};
  public originalActions: PackagedActions<CONTROL_STATES, MUTATIONS> = {};

  private packagedActions: PackagedActions<CONTROL_STATES, MUTATIONS> = {};
  private stepReactions: Array<StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>> = [];
  
  constructor() {}

  get Mutations(): MUTATIONS {
    throw new Error("Mutations property is for typing purpose only. Don't use it.")
  }

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

  addTransformation<C extends Transformation<TYPE, CONTROL_STATES>>(transformer: C): any {
    this.transformer = transformer;
    return this;
  }

  addStaticTransformation<C extends StaticTransformation<TYPE, ACTIONS>>(transformer: C): any {
    this.staticTransformer = transformer;
    return this  
  }

  addStepReaction(reaction: StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>): any {
    this.stepReactions.push(reaction);
    return this;
  }

  create(
    initialValue: TYPE,
    options?: ContainerOption
  ): IInstance<
    TYPE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    REPRESENTATION
  > {
    // Refuse a broken control state tree here, while the stack still points at
    // the declaration. A forward reference is legal, so it can not be done
    // earlier than this.
    validateControlStatePredicates(this.controlStatePredicates);

    const instance = new Instance(initialValue, this.stepReactions, this, options)

    return {
      get stepId() { return instance.stepId },
      get lastAttempt() { return instance.lastAttempt },
      actions: instance.actions,
      controlStates: instance.controlStates,
      representationRef: instance.representationRef,
      compose: instance.compose,
      rollback: (step) => instance.rollback(step),
      reset: (state) => instance.reset(state),
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



/**
 * The action was refused by its own auth predicate: the proposal is never presented
 * to the model. Report it on the instance so the refusal is not console only.
 */
function reportUnauthorized(
  instance: IInstance<any, any, any, any> & SAMLoop,
  actionName: string,
  origin?: Origin
) {
  instance.discardProposal({
    code: RejectionCode.unauthorized,
    message: `Unauthorized action ${actionName} at step ${instance.stepId}.`,
    meta: {
      action: actionName,
      controlStates: instance.controlStates.slice(),
    },
  }, origin);
}

/**
 * An action is presented only if it is allowed in the state it is presented
 * in. The same check is made when it is called, once it resolved when it is
 * asynchronous, and when its turn comes when its proposal had to wait: it goes
 * with the proposal.
 */
function toGate(
  instance: IInstance<any, any, any, any> & SAMLoop,
  actionName: string,
  authPredicate: ((actionContext: ActionContext) => boolean) | undefined,
  origin?: Origin
) {
  const isAllowed = function () {
    // No action is called from inside the presentation of a proposal.
    if (instance.refuseIfLocked(origin)) {
      return false;
    }
    if (!authPredicate || authPredicate({ controlStates: instance.controlStates })) {
      return true;
    }
    console.warn(
        `Unauthorized action ${actionName} at step ${instance.stepId} with control states: ${instance.controlStates}`
    );
    reportUnauthorized(instance, actionName, origin);
    return false;
  };
  return { isAllowed, origin: { ...origin, isAllowed } };
}

/**
 * An action is called, it is not read. Calling one reads the step id, to tag
 * its proposal, and the control states, to know whether it is allowed:
 * whoever calls it from an autorun of MobX must not come to depend on them,
 * and run again at each step.
 */
function unobserved<F extends (...args: any[]) => any>(call: F): F {
  const unobservedCall = (...args: any[]) => untracked(() => call(...args));
  return unobservedCall as F;
}

function toSyncAction<A extends (...args: any[]) => any>(
  name: string,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return function(instance: IInstance<any, any, any, any> & SAMLoop, origin?: Origin) {
      return unobserved(function (...args: Parameters<A>): Proposal<any> | undefined {
          const gate = toGate(instance, name, authPredicate, origin);
          // Check auth
          if (!gate.isAllowed()) {
              return;
          }
          const proposal: TaggedProposal = Object.assign(action(...args), {
              stepId: instance.stepId,
          });
          instance.startStep(proposal, gate.origin);
      })
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
  return function(instance: IInstance<any, any, any, any> & SAMLoop, origin?: Origin) {
      return unobserved(async function (...args: Parameters<A>): Promise<void> {
      const gate = toGate(instance, name, authPredicate, origin);
      // Check auth
      if (!gate.isAllowed()) {
          return;
      }
      const proposal: TaggedProposal = Object.assign(await action(...args), {
          stepId: instance.stepId,
      });
      // Check auth again
      // Maybe the app as reached a step where this action is
      // no more allowed
      if (!gate.isAllowed()) {
          return;
      }
      instance.startStep(proposal, gate.origin);
      });
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
  return function(instance: IInstance<any, any, any, any> & SAMLoop, origin?: Origin) {
      return unobserved(async function (...args: Parameters<A>): Promise<void> {
      const gate = toGate(instance, action.name, authPredicate, origin);
      // Check auth
      if (!gate.isAllowed()) {
          return;
      }
      // Preserve the step id during which the action call occured.
      // It will be used to determinate, after the action resolving, if this proposal is still valid.
      const stepId = instance.stepId;
      // A step id comes back with a rollback. The moment does not: it tells
      // whether anything happened since the call.
      const calledAt = instance.moment;
      const proposal: TaggedProposal = Object.assign(await action(...args), {
          stepId,
      });
      instance.startStep(proposal, { ...gate.origin, calledAt });
      });
  }
}