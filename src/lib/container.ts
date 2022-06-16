import { IObservable, IObservableArray, observable, runInAction } from "mobx";
import { IContainerFactory } from "..";
import {
  Acceptor,
  AcceptorFactory,
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
    SAMLoop,
    IContainerFactory<
      TYPE,
      MUTATIONS,
      CONTROL_STATES,
      ACTIONS,
      REPRESENTATION
    > {
  private model!: TYPE;
  private acceptors: Record<
    string,
    {
      condition?: (model: TYPE) => boolean;
      mutator: (payload: any) => void;
    }
  > = {};
  private packagedActions: PackagedActions<CONTROL_STATES, MUTATIONS> = {};
  private originalActions: ACTIONS = {} as ACTIONS;
  private wrapedActions: ACTIONS = {} as ACTIONS;
  private controlStatePredicates: Array<
    [CONTROL_STATES, CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>]
  > = [];
  private currentControlStates: IObservableArray<CONTROL_STATES> = observable(
    []
  );
  private _stepId = observable.box(0);
  private transformer?: Transformation<TYPE>;
  private stepReactions: Array<{
    name: string;
    reaction: StepReaction<any, any, any, any>;
  }> = [];
  private representationRef: {
    current: REPRESENTATION & IObservable;
  } = {
    current: undefined as any as REPRESENTATION & IObservable,
  };
  private NAPproposalBuffer: IProposalBuffer<any> = createNAPProposalBuffer<any>();
  private isRunningNAP = false;
  private acceptorsFactories: Array<[string, AcceptorFactory<TYPE, any>]> = [];

  constructor(private options?: ContainerOption) {}

  public get stepId(): number {
    return this._stepId.get();
  }

  public get controlStates(): CONTROL_STATES[] {
    return this.currentControlStates;
  }

  addAcceptor<N extends string, M extends AcceptorFactory<TYPE, any>>(
    name: N,
    acceptorFactory: M
  ): any {
    if (this.acceptorsFactories.some(([_name]) => _name === name)) {
      throw new Error(
        `This component has already an acceptor bound to ${name}`
      );
    }
    this.acceptorsFactories.push([name, acceptorFactory]);
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
    this.originalActions = {} as any;
    this.packagedActions = { ...this.packagedActions, ...actions };
    this.wrapedActions = {} as any;
    Object.keys(this.packagedActions).map((k) => {
      const key = (k as unknown) as keyof typeof this.wrapedActions & string;
      const actionPackage = this.packagedActions[k];

      if (isMutationShortcut<MUTATIONS>(actionPackage)) {
        // The action is just a shortcut to an acceptor with the same name.
        // Wrap the acceptor mutator in an synchronous action.
        const action = (payload: any): Mutation<any, any>[] => [
          { type: actionPackage, payload },
        ];
        (this.originalActions[key] as any) = action;
        (this.wrapedActions[key] as any) = toSyncAction(
          key,
          this,
          (payload: any): Mutation<any, any>[] => [
            { type: actionPackage, payload },
          ]
        );
      } else if (isSyncAction(actionPackage)) {
        (this.originalActions[key] as any) = actionPackage;
        (this.wrapedActions[key] as any) = toSyncAction(
          key,
          this,
          actionPackage
        );
      } else if (isConfigurableAction(actionPackage)) {
        (this.originalActions[key] as any) = actionPackage.action;
        (this.wrapedActions[key] as any) = actionPackage.isAsync
          ? actionPackage.isCancelable
            ? toCancelableAsyncAction(
                this,
                actionPackage.action,
                actionPackage.isAllowed as any
              )
            : toAsyncAction(
                key,
                this,
                actionPackage.action,
                actionPackage.isAllowed as any
              )
          : toSyncAction(
              key,
              this,
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
    initialValue: TYPE
  ): {
    controlStates: CONTROL_STATES[];
    representationRef: { current: REPRESENTATION };
    actions: ACTIONS;
    compose(composer: ActionComposer<ACTIONS, MUTATIONS>): void;
  } {
    // Affect the model
    this.model = (observable(
      initialValue as Record<string, unknown>
    ) as unknown) as TYPE;

    // Bound acceptors to model
    this.acceptorsFactories.forEach(([name, acceptorFactory]) => {
      this.acceptors[name] = acceptorFactory(this.model);
    });

    // Get the initial control states
    this.currentControlStates.replace(
      getControlStates<CONTROL_STATES>({
        model: this.model,
        acceptedMutations: [],
        previousControlStates: [],
        controlStatePredicates: this.controlStatePredicates,
        keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
      })
    );

    // Init representation
    if (this.transformer) {
      this.representationRef.current = observable(this.transformer(this.model));
    }
    // Or assign the model as the representation one for all.
    else {
      this.representationRef.current = (this
        .model as unknown) as REPRESENTATION & IObservable;
    }

    return {
      actions: this.wrapedActions,
      controlStates: this.currentControlStates,
      representationRef: this.representationRef,
      compose: this.composer,
    };
  }

  startStep(proposal: TaggedProposal): void {
    // The proposal should be tagged with the current step ID
    // If not, that means that is an old payload and the presentation is not possible.

    if (proposal.stepId !== this.stepId) {
      console.info(
        "[RAVIOLI] Tried to present a proposal with a different step id.",
        proposal
      );
      return;
    }

    // When running step reaction, all the proposal emited from the reaction are buffered.
    // We don't start the step until all reaction are ran.
    // Once reactions are ran, we start the step with a composed proposal.
    if (this.isRunningNAP) {
      this.NAPproposalBuffer.push(proposal);
      return;
    }

    // Put in this transaction all the needed updates
    // The view won't react until the transaction is finished.
    const previousControlStates = this.controlStates.slice();
    const acceptedMutations: MUTATIONS[] = [];
    runInAction(() => {
      acceptedMutations.push(...this.present(proposal));

      // No mutations happened, abort the step
      if (!acceptedMutations.length) {
        return;
      }

      // Model is updated, the new step is validated.
      this._stepId.set(this._stepId.get() + 1);
      // Reset the NAP proposal buffer
      this.NAPproposalBuffer.clear();
      this.NAPproposalBuffer.setStepId(this._stepId.get());

      // After each step, trigger all control state predicates
      this.currentControlStates.replace(
        getControlStates<CONTROL_STATES>({
          model: this.model,
          acceptedMutations,
          previousControlStates: this.controlStates.slice(),
          controlStatePredicates: this.controlStatePredicates,
          keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
        })
      );
    });

    this.isRunningNAP = true;

    // Defer representation update if there is some extra proposal to handle.
    if (this.transformer && (!this.options?.debounceReaction ?? true)) {
      derivate(this.representationRef.current, this.transformer(this.model));
    }

    // Run the static NAP
    const args = {
      model: this.model,
      delta: {
        acceptedMutations,
        proposal,
        controlStates: this.currentControlStates,
        previousControlStates,
      },
    };
    this.stepReactions.forEach(({ reaction }) => {
      // Filter nap which have already ran on the instance
      if (!reaction.predicate || reaction.predicate(args)) {
        reaction.effect({ ...args, actions: this.wrapedActions });
      }
    });

    this.isRunningNAP = false;

    if (this.NAPproposalBuffer.length) {
      this.startStep(this.NAPproposalBuffer.getTaggedProposal());
    }

    // Refresh the represenation
    if (this.transformer) {
      derivate(this.representationRef.current, this.transformer(this.model));
    }
  }

  /**
   * Agreggate proposal of multiple actions for the same step.
   */
  private composer = (
    composer: (originalActions: ACTIONS) => Proposal<MUTATIONS>[]
  ) => {
    const taggedProposal: TaggedProposal = Object.assign(
      composer(this.originalActions).reduce(
        (mutations, proposal) => mutations.concat(proposal),
        []
      ),
      { stepId: this.stepId }
    );
    this.startStep(taggedProposal);
  };

  private present(proposal: Proposal<MUTATIONS>): MUTATIONS[] {
    return proposal.filter(({ type, payload }) => {
      // Acceptor exists
      const acceptor: Acceptor<any> | undefined = this.acceptors[type];
      // Acceptor condition
      if (acceptor.condition === undefined || acceptor.condition(payload)) {
        // Do the mutation
        acceptor.mutator(payload);
        return true;
      }
      return false;
    });
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
  container: ContainerFactory<any, any, any, any> & SAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return function (...args: Parameters<A>): Proposal<any> | undefined {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: container.controlStates })) {
        console.warn(
          `Unauthorized action ${name} at step ${container.stepId} with control states: ${container.controlStates}`
        );
        return;
      }
    }
    const proposal: TaggedProposal = Object.assign(action(...args), {
      stepId: container.stepId,
    });
    container.startStep(proposal);
  };
}

/**
 * Used when an action call and its proposal presentation occurs at different steps.
 * Eg. Fetching some data
 */
function toAsyncAction<A extends (...args: any[]) => any>(
  name: string,
  container: ContainerFactory<any, any, any, any> & SAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return async function (...args: Parameters<A>): Promise<void> {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: container.controlStates })) {
        console.warn(
          `Unauthorized action ${name} at step ${container.stepId} with control states: ${container.controlStates}`
        );
        return;
      }
    }
    const proposal: TaggedProposal = Object.assign(await action(...args), {
      stepId: container.stepId,
    });
    // Check auth again
    // Maybe the app as reached a step where this action is
    // no more allowed

    if (authPredicate) {
      if (!authPredicate({ controlStates: container.controlStates })) {
        console.warn(
          `Unauthorized action ${name} at step ${container.stepId} with control states: ${container.controlStates}`
        );
        return;
      }
    }
    container.startStep(proposal);
  };
}

/**
 * Used when more than a mix of sync and async action can occurs during a step. The one which first presents its proposal wins.
 * Eg.
 *   Actions.asyncSave()
 *   // Waiting for save... Ho no, a typo!
 *   Actions.syncCancel() <-- this one will present its proposal first, the proposal of asyncSave will be ignored.
 */
function toCancelableAsyncAction<A extends (...args: any[]) => any>(
  container: ContainerFactory<any, any, any, any> & SAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return async function (...args: Parameters<A>): Promise<void> {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: container.controlStates })) {
        console.warn(
          `Unauthorized action ${name} at step ${container.stepId} with control states: ${container.controlStates}`
        );
        return;
      }
    }
    // Preserve the step id during which the action call occured.
    // It will be used to determinate, after the action resolving, if this proposal is still valid.
    const stepId = container.stepId;
    const proposal: TaggedProposal = Object.assign(await action(...args), {
      stepId,
    });
    container.startStep(proposal);
  };
}