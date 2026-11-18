import { IObservable, IObservableArray, IObservableValue, observable, runInAction } from "mobx";
import { IInstance } from "../api";
import { Acceptor, Mutation } from "./api/acceptor";
import { IProposalBuffer, Proposal, SAMLoop, Step, TaggedProposal } from "./api/presentable";
import { StepReaction } from "./api/stepReaction";
import { ContainerFactory, ContainerOption } from "./container";
import { getControlStates } from "./controlState";
import { derivate, reconcile } from "./derivate";
import { createNAPProposalBuffer } from "./proposalBuffer";
import { Compose } from "./api/composer";
import { Attempt, Reason, Rejection, RejectionCode, toReason } from "./api/rejection";

export class Instance<
    TYPE,
    MUTATIONS extends Mutation<any, any> = { type: never; payload: never },
    CONTROL_STATES extends string = never,
    ACTIONS = never,
    REPRESENTATION = TYPE
> implements IInstance<
  TYPE,
  MUTATIONS,
  CONTROL_STATES,
  ACTIONS,
  REPRESENTATION
>, SAMLoop {
    public actions: ACTIONS = {} as ACTIONS;
    public representationRef: {
        current: REPRESENTATION & IObservable;
      } = {
        current: undefined as any as REPRESENTATION & IObservable,
    };

    constructor(
        data: TYPE,
        reactions: Array<StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>>,
        private factory: ContainerFactory<
            TYPE,
            MUTATIONS,
            CONTROL_STATES,
            ACTIONS,
            REPRESENTATION
        >,
        private options?: ContainerOption,
    ){
        // Initialize stepId (can be hydrated from persisted state)
        this._stepId = observable.box(options?.initialStepId ?? 0);

        // The data is now observable
        // ISSUE: do we need make it observable?
        this.data  = (observable(data as Record<string, unknown>) as unknown) as TYPE;

        this.stepReactions = [...reactions]

        // Bind action to instance
        Object.keys(factory.wrapedActions).map((k) => {
            const key = k as keyof ACTIONS
            (this.actions[key] as any) = factory.wrapedActions[k](this)
        })

        // Get the initial control states
        this.currentControlStates.replace(
            getControlStates<CONTROL_STATES>({
            data: this.data,
            acceptedMutations: [],
            previousControlStates: [],
            controlStatePredicates: this.factory.controlStatePredicates,
            })
        );

        // Init representation
        if (!!this.factory.staticTransformer || !!this.factory.transformer) {
          // The instance has a static tranformation, only computed once.
          if (this.factory.staticTransformer) {
            this.representationRef.current = this.factory.staticTransformer({data: this.data, actions: this.actions })
          } else if (this.factory.transformer){
            this.representationRef.current = observable(this.factory.transformer({data: this.data, controlStates: this.currentControlStates}));
          }
        }
        // Or assign the model as the representation one for all.
        else {
            this.representationRef.current = (this.data as any) as REPRESENTATION & IObservable
        }

        // Run the reactions
        this.react( {
          data: this.data,
          delta: {
            acceptedMutations: [],
            proposal: [],
            controlStates: this.currentControlStates,
            previousControlStates: [],
          },
        }, true)
    }
    private data: TYPE;
    public stepReactions: Array<StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION>> = [];
    private disposeReaction(effect: StepReaction<any, any, any, any, any>["do"]) {
      const index = this.stepReactions.findIndex((r) => r.do === effect)
      if (index > -1 ) {
        this.stepReactions.splice(index, 1)
        return true
      }
      return false
    }
    private _stepId: IObservableValue<number>;
    public get stepId(): number {
      return this._stepId.get();
    }

    /**
     * The outcome of the last step attempt.
     * It is written on each presented proposal, accepted or not, and is undefined
     * until the first attempt. It is a MobX observable: use it to display why
     * something was refused. It is NOT the error state of your app, which belongs
     * to the model as any other data.
     */
    private _lastAttempt: IObservableValue<Attempt<MUTATIONS> | undefined> = observable.box(
      undefined,
      { deep: false }
    );
    public get lastAttempt(): Attempt<MUTATIONS> | undefined {
      return this._lastAttempt.get();
    }

    /**
     * A proposal was refused before reaching the model. No step, no reaction.
     */
    public discardProposal(reason: Reason): void {
      runInAction(() => {
        this._lastAttempt.set({
          status: "discarded",
          attemptedAt: this._stepId.get(),
          reason,
        });
      });
    }
    
    private currentControlStates: IObservableArray<CONTROL_STATES> = observable([]);    
    public get controlStates(): CONTROL_STATES[] {
        return this.currentControlStates;
      }

    private NAPproposalBuffer: IProposalBuffer<any> = createNAPProposalBuffer<any>();
    private isRunningNAP = false;
    /**
     * How many steps in a row were started by the reactions themselves.
     * Reset as soon as a reaction pass proposes nothing.
     */
    private napCascade = 0;

    /**
     * A step reaction pass did not run to the end. The step itself stands, its
     * consequences do not. Report it on the last attempt rather than throwing:
     * the caller never awaited the reaction pass and can not catch it.
     */
    private reportUnsettled(reason: Reason): void {
      console.error(`[RAVIOLI] ${reason.message}`);
      const attempt = this._lastAttempt.get();
      if (attempt === undefined || attempt.status !== "accepted") {
        return;
      }
      runInAction(() => {
        this._lastAttempt.set({ ...attempt, settled: false, reason });
      });
    }

    /**
    * Agreggate proposal of multiple actions for the same step.
    */
    public compose: Compose<ACTIONS, MUTATIONS> = (composer) => {
      const proposals = (typeof composer === 'function' 
        ? composer(this.factory.originalActions as unknown as ACTIONS) 
        : composer
      )

      const taggedProposal: TaggedProposal = Object.assign(
        proposals.reduce(
          (mutations, proposal) => mutations.concat(proposal),
          []
        ),
        { stepId: this._stepId.get() }
      );
      this.startStep(taggedProposal);
    };

  public startStep(proposal: TaggedProposal): void {
    // Major guard #1
    // The proposal should be tagged with the current step ID
    // If not, that means that is an old payload and the presentation is not possible.

    const attemptedAt = this._stepId.get();

    if (proposal.stepId !== attemptedAt) {
      console.info(
        "[RAVIOLI] Tried to present a proposal with a different step id.",
        proposal
      );
      this.discardProposal({
        code: RejectionCode.staleProposal,
        message: `The proposal was tagged with the step ${proposal.stepId} but the current step is ${attemptedAt}.`,
        meta: { proposalStepId: proposal.stepId },
      });
      return;
    }

    // Major guard #2
    // When running step reactions, all the proposal emited from the reactions are buffered.
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
    let didUpdate = false
    runInAction(() => {
      const { accepted, rejected } = this.present(proposal);
      acceptedMutations.push(...accepted);

      // Whatever the model decided, the attempt is reported.
      this._lastAttempt.set(
        acceptedMutations.length
          ? { status: "accepted", attemptedAt, accepted: acceptedMutations.slice(), rejected, settled: true }
          : { status: "rejected", attemptedAt, rejected }
      );

      // No mutations happened, abort the step
      if (!acceptedMutations.length) {
        return;
      }
      // Model is updated, the new step is validated.
      this._stepId.set(this._stepId.get() + 1)
      // Reset the NAP proposal buffer
      this.NAPproposalBuffer.clear();
      this.NAPproposalBuffer.setStepId(this._stepId.get());

      // After each step, trigger all control state predicates
      this.currentControlStates.replace(
        getControlStates<CONTROL_STATES>({
          data: this.data,
          acceptedMutations,
          previousControlStates: this.controlStates.slice(),
          controlStatePredicates: this.factory.controlStatePredicates,
        })
      );
      didUpdate = true
    });

    if (didUpdate) {
      this.isRunningNAP = true;

      // Run the static NAP
      const args = {
        data: this.data,
        delta: {
          acceptedMutations,
          proposal,
          controlStates: this.currentControlStates,
          previousControlStates,
        },
      };
      this.react(args);
    }
  }

  /**
   * Jump to another step without rebuilding the container.
   *
   * The model data is reconciled in place: the representation keeps its
   * reference and all the observers stay attached. The delta of the targeted
   * step is reinjected, then the step reactions replay against it, so a reaction
   * which reads the arrival behaves as it did on the container which walked the
   * path.
   *
   * It does not present a proposal: no acceptor runs, no condition is checked.
   * The given data is taken as it is.
   */
  public rollback(step: Step<TYPE, MUTATIONS, CONTROL_STATES>): void {
    // Major guard
    // A rollback while the reactions are running would move the model under them
    // and let the abandoned timeline leak in the new one.
    if (this.isRunningNAP) {
      console.warn(
        "[RAVIOLI] Tried to rollback while running the step reactions."
      );
      return;
    }

    const stepId = getRollbackStepId(step);

    // Put in this transaction all the needed updates
    // The view won't react until the transaction is finished.
    runInAction(() => {
      reconcile(this.data as unknown as object, step.data);
      this._stepId.set(stepId);
      this.currentControlStates.replace(step.delta.controlStates);
      // The buffer and the last attempt belong to the abandoned timeline.
      this.NAPproposalBuffer.clear();
      this.NAPproposalBuffer.setStepId(stepId);
      this._lastAttempt.set(undefined);
    });

    this.isRunningNAP = true;

    // Replay the arrival at this step.
    this.react({
      data: this.data,
      delta: {
        acceptedMutations: step.delta.acceptedMutations,
        proposal: step.delta.proposal,
        controlStates: this.currentControlStates,
        previousControlStates: step.delta.previousControlStates,
      },
    });
  }

  /**
   * Put the container back to its creation step.
   *
   * The creation step is the only one which can be rebuilt from the data alone:
   * it has no past, so its control states are computed the way the constructor
   * does. The author gives the state back, the instance does not keep a copy.
   */
  public reset(state: TYPE): void {
    // Major guard
    // Same as a rollback: not while the reactions are running.
    if (this.isRunningNAP) {
      console.warn(
        "[RAVIOLI] Tried to reset while running the step reactions."
      );
      return;
    }

    const stepId = this.options?.initialStepId ?? 0;

    // Put in this transaction all the needed updates
    // The view won't react until the transaction is finished.
    runInAction(() => {
      reconcile(this.data as unknown as object, state);
      this._stepId.set(stepId);
      // No past: the control states are the ones of a brand new container.
      this.currentControlStates.replace(
        getControlStates<CONTROL_STATES>({
          data: this.data,
          acceptedMutations: [],
          previousControlStates: [],
          controlStatePredicates: this.factory.controlStatePredicates,
        })
      );
      this.NAPproposalBuffer.clear();
      this.NAPproposalBuffer.setStepId(stepId);
      this._lastAttempt.set(undefined);
    });

    this.isRunningNAP = true;

    // Replay the creation.
    this.react(
      {
        data: this.data,
        delta: {
          acceptedMutations: [],
          proposal: [],
          controlStates: this.currentControlStates,
          previousControlStates: [],
        },
      },
      true
    );
  }

  private async react(
    args: {
      data: TYPE; delta: {
        acceptedMutations: MUTATIONS[];
        proposal: TaggedProposal;
        controlStates: IObservableArray<CONTROL_STATES>;
        previousControlStates: CONTROL_STATES[];
      }
    },
    isInit: boolean = false
  ) {
    // Nobody awaits this pass and nobody can catch it: a throw which escaped
    // here used to leave isRunningNAP true, and the instance then refused every
    // later step, rollback and reset for good.
    //
    // Kept inline on purpose. Delegating to an awaited method would push the
    // recovery to the next microtask, and a caller acting synchronously right
    // after the throw would still find the instance closed.
    try {
      // The reactions as they are when the pass starts. Another pass can
      // dispose of a one shot reaction while this one waits: counting in the
      // list itself would then skip the reaction which follows it.
      const reactions = this.stepReactions.slice();
      for (let i = 0; i < reactions.length; i++) {
        const { runOnInit = true, when: predicate, do: effect, once, debugName, awaitAsync } = reactions[i];
        // A one shot reaction another pass disposed of meanwhile has had its run.
        if ((isInit && !runOnInit) || this.stepReactions.indexOf(reactions[i]) === -1) {
          continue
        }
        // Filter nap which have already ran on the instance
        if (!predicate || predicate(args)) {
          // Run the reaction
          if (debugName) {
            console.info("[SAM] reaction:", debugName);
          }
          const result = effect({ ...args, actions: this.actions, representation: this.representationRef.current, compose: this.compose });
          // Await the effect if awaitAsync is set to ensure sequential execution
          if (awaitAsync && result instanceof Promise) {
            await result;
          }
          // If it is a one shot reaction, dispose
          if (once) {
            this.disposeReaction(effect);
          }

        }
      }

      this.isRunningNAP = false;

      if (this.NAPproposalBuffer.length) {
        // A reaction proposed something. Nothing says the next pass will propose
        // less, so count the chain and cut it before it eats the stack.
        this.napCascade++;
        if (this.napCascade > MAX_NAP_CASCADE) {
          this.stopCascade();
        } else {
          this.startStep(this.NAPproposalBuffer.getTaggedProposal());
        }
      } else {
        // The pass settled.
        this.napCascade = 0;
      }

      // Refresh the represenation
      if (this.factory.transformer) {
        derivate(this.representationRef.current, this.factory.transformer({data: this.data, controlStates: this.currentControlStates}));
      }
    } catch (error) {
      this.reportUnsettled(toUnsettledReason(error));
    } finally {
      this.isRunningNAP = false;
    }
  }

  /**
   * The reactions kept proposing. Drop what they were about to present and say
   * so, rather than recursing until the stack gives up.
   */
  private stopCascade(): void {
    this.napCascade = 0;
    this.NAPproposalBuffer.clear();
    this.NAPproposalBuffer.setStepId(this._stepId.get());
    this.reportUnsettled({
      code: RejectionCode.reactionsDidNotSettle,
      message: `The step reactions did not settle after ${MAX_NAP_CASCADE} steps.`,
      meta: { steps: MAX_NAP_CASCADE },
    });
  }

  private present(
    proposal: Proposal<MUTATIONS>
  ): { accepted: MUTATIONS[]; rejected: Rejection<MUTATIONS>[] } {
    const accepted: MUTATIONS[] = [];
    const rejected: Rejection<MUTATIONS>[] = [];

    for (const mutation of proposal) {
      const { type, payload } = mutation;
      const acceptor: Acceptor<any, any> | undefined = this.factory.acceptors[type];

      // Acceptor exists
      if (acceptor === undefined) {
        rejected.push({
          mutation,
          reason: {
            code: RejectionCode.unknownAcceptor,
            message: `No acceptor is bound to "${type}".`,
          },
        });
        continue;
      }

      // Acceptor condition
      const reason =
        acceptor.condition === undefined
          ? undefined
          : toReason(acceptor.condition(this.data, payload));

      if (reason !== undefined) {
        rejected.push({ mutation, reason });
        continue;
      }

      // Do the mutation
      acceptor.mutator(this.data, payload);
      accepted.push(mutation);
    }

    return { accepted, rejected };
  }
}

/**
 * A proposal is tagged with the step it was presented against: the step it
 * produced is the next one.
 */
function getRollbackStepId(step: Step<any, any, any>): number {
  if (step.delta.proposal.stepId === undefined) {
    throw new Error(
      "[RAVIOLI] Can't place this step in time: its proposal has no step id. The creation step is not rolled back to, it is reset to."
    );
  }
  return step.delta.proposal.stepId + 1;
}

/**
 * How many steps in a row the reactions may start before the instance calls it
 * a runaway. A settling chain is a handful of steps, never dozens.
 */
const MAX_NAP_CASCADE = 50;

function toUnsettledReason(error: unknown): Reason {
  return {
    code: RejectionCode.reactionThrew,
    message: error instanceof Error ? error.message : String(error),
    meta: { error },
  };
}
