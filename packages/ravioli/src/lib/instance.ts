import { IObservable, IObservableArray, IObservableValue, observable, runInAction, untracked } from "mobx";
import { IInstance } from "../api";
import { Acceptor, Mutation } from "./api/acceptor";
import { IProposalBuffer, Proposal, SAMLoop, Step, TaggedProposal } from "./api/presentable";
import { Origin, ReactionPass } from "./origin";
import { StepReaction } from "./api/stepReaction";
import { ContainerFactory, ContainerOption } from "./container";
import { getControlStates } from "./controlState";
import { derivate, reconcile } from "./derivate";
import { IProposalQueue, WaitingProposal, createNAPProposalBuffer, createProposalQueue } from "./proposalBuffer";
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
        this.react({ data: this.data, delta: this.toCreationDelta() }, true)
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
     * A step id comes back to a value it had with a rollback, a reset or a step
     * which is taken back. The moment counts the steps and the jumps, so it
     * never does: it tells whether anything happened since it was read.
     */
    private _moment = 0;
    public get moment(): number {
      return this._moment;
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
    public discardProposal(reason: Reason, origin?: Origin<MUTATIONS>): void {
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
    /**
     * What was presented while the container was busy, by somebody else than
     * the reactions of the step it was busy with.
     */
    private waitingProposals: IProposalQueue<MUTATIONS> = createProposalQueue<MUTATIONS>();
    /**
     * The reaction pass which keeps the container closed: from the moment a
     * step is accepted until its reactions, and the steps they start, are done.
     */
    private pass?: Pass<MUTATIONS, CONTROL_STATES>;
    /**
     * The pass of the reaction which is running right now. Whatever that
     * reaction calls to present a proposal meanwhile, the proposal is its own.
     */
    private reacting?: Pass<MUTATIONS, CONTROL_STATES>;
    private isTakingTurns = false;
    private get isBusy(): boolean {
      return this.pass !== undefined || this.isTakingTurns;
    }

    /**
     * A step reaction pass did not run to the end. The step itself stands, its
     * consequences do not. Report it on the last attempt rather than throwing:
     * the caller never awaited the reaction pass and can not catch it.
     */
    private reportUnsettled(pass: Pass<MUTATIONS, CONTROL_STATES>, reason: Reason): void {
      console.error(`[RAVIOLI] ${reason.message}`);
      // The pass of the creation, of a rollback or of a reset reacts to no
      // step: it has no attempt to report on, and must not report on another's.
      const attempt = pass.step?.attempt;
      if (attempt === undefined || this._lastAttempt.get() !== attempt) {
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
      // Called, not read: an autorun which composes does not come to depend
      // on the step id its proposal is tagged with.
      untracked(() => this.startStep(this.toTaggedProposal(composer)));
    };

    private toTaggedProposal(composer: Parameters<Compose<ACTIONS, MUTATIONS>>[0]): TaggedProposal {
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
      return taggedProposal;
    }

    /**
     * What a reaction is given to propose with. It says which pass the reaction
     * is of: what it proposes after having waited is still of that step.
     */
    private toHandles(pass: Pass<MUTATIONS, CONTROL_STATES>): { actions: ACTIONS; compose: Compose<ACTIONS, MUTATIONS> } {
      const actions = {} as ACTIONS;
      Object.keys(this.factory.wrapedActions).map((k) => {
          const key = k as keyof ACTIONS
          (actions[key] as any) = this.factory.wrapedActions[k](this, { pass })
      })
      return {
        actions,
        compose: (composer) => {
          untracked(() => this.startStep(this.toTaggedProposal(composer), { pass }));
        },
      };
    }

  /**
   * Major guard #0
   * The step is locked while its proposal is presented. Only a step reaction
   * or the view presents a proposal, between two steps: a condition, a
   * mutator, a control state predicate, or whoever listens to the model
   * meanwhile, does not send an action. What they propose is discarded.
   */
  public refuseIfLocked(origin?: Origin<MUTATIONS>): boolean {
    if (this.pass !== PRESENTING) {
      return false;
    }
    console.info(
      "[RAVIOLI] Tried to present a proposal while another one is being presented."
    );
    this.discardProposal({
      code: RejectionCode.stepLocked,
      message: "A proposal is already being presented.",
    }, origin);
    return true;
  }

  public startStep(proposal: TaggedProposal, origin: Origin<MUTATIONS> = {}): void {
    if (this.refuseIfLocked(origin)) {
      return;
    }
    // The pass of the reaction which made the proposal, when a reaction did:
    // the one which gave it its actions, or the one which is running it.
    const pass = origin.pass || this.reacting;
    // A step the reactions start while their chain of steps runs is one more
    // in a row. Once it is over, after a timer for example, it is a new one.
    const depth = pass === undefined || pass.chain.isOver ? 0 : pass.depth + 1;

    // Major guard #2
    // When running step reactions, all the proposal emited from the reactions are buffered.
    // We don't start the step until all reaction are ran.
    // Once reactions are ran, we start the step with a composed proposal.
    //
    // What comes from elsewhere meanwhile waits behind it, for a step of its own.
    // A stale proposal does not wait: it goes on to the guard #1, which discards it.
    if (this.isBusy && !this.isStale(proposal, origin)) {
      if (pass !== undefined && this.isClosedBy(pass)) {
        this.NAPproposalBuffer.push(proposal);
      } else {
        this.waitingProposals.push({ proposal, origin, depth });
      }
      return;
    }

    this.takeStep(proposal, origin, depth);
  }

  /**
   * A proposal is stale when the container moved since it was tagged. A
   * cancelable action also keeps the moment it was called at: the step id
   * alone can not tell a step which was taken and then taken back.
   */
  private isStale(proposal: TaggedProposal, origin: Origin<MUTATIONS>): boolean {
    return (
      proposal.stepId !== this._stepId.get() ||
      (origin.calledAt !== undefined && origin.calledAt !== this._moment)
    );
  }

  private takeStep(
    proposal: TaggedProposal,
    origin: Origin<MUTATIONS>,
    depth: number,
    from?: Pass<MUTATIONS, CONTROL_STATES>
  ): void {
    // Major guard #1
    // The proposal should be tagged with the current step ID
    // If not, that means that is an old payload and the presentation is not possible.

    const attemptedAt = this._stepId.get();

    if (this.isStale(proposal, origin)) {
      console.info(
        "[RAVIOLI] Tried to present a proposal with a different step id.",
        proposal
      );
      this.discardProposal({
        code: RejectionCode.staleProposal,
        message: `The proposal was tagged with the step ${proposal.stepId} but the current step is ${attemptedAt}.`,
        meta: { proposalStepId: proposal.stepId },
      }, origin);
      return;
    }

    const before = this.pass;
    const pass: Pass<MUTATIONS, CONTROL_STATES> = toPass(depth, from?.chain);
    // Locked while the proposal is presented.
    this.pass = PRESENTING;
    let delta: Arrival<MUTATIONS, CONTROL_STATES> | undefined;
    // An observer can throw at the end of the transaction. The step is taken
    // all the same, and its reactions run.
    try {
      // Put in this transaction all the needed updates
      // The view won't react until the transaction is finished.
      runInAction(() => {
        try {
          delta = this.accept(proposal, origin, pass, from);
        } finally {
          if (delta === undefined) {
            // No step: nothing to take back, and the container is as open
            // as it was. Not later: an observer which acts on a refusal, at
            // the end of the transaction, is not locked out.
            this.pass = before;
          }
        }
      });
    } finally {
      if (delta !== undefined) {
        // Run the static NAP
        this.react({ data: this.data, delta }, false, pass);
      }
    }
  }

  /**
   * Present the proposal to the model. When the model accepts some of it the
   * step is taken: the pass is the one of its reactions, and the container
   * stays closed until they are done.
   */
  private accept(
    proposal: TaggedProposal,
    origin: Origin<MUTATIONS>,
    pass: Pass<MUTATIONS, CONTROL_STATES>,
    from?: Pass<MUTATIONS, CONTROL_STATES>
  ): Arrival<MUTATIONS, CONTROL_STATES> | undefined {
    const attemptedAt = this._stepId.get();
    const previousControlStates = this.controlStates.slice();
    const { accepted: acceptedMutations, rejected } = this.present(proposal);

    // Whatever the model decided, the attempt is reported.
    const attempt: Attempt<MUTATIONS> = acceptedMutations.length
        ? { status: "accepted", attemptedAt, accepted: acceptedMutations.slice(), rejected, settled: true }
        : { status: "rejected", attemptedAt, rejected };
    this._lastAttempt.set(attempt);

    // No mutations happened, abort the step
    if (attempt.status !== "accepted") {
      return undefined;
    }
    // Model is updated, the new step is validated.
    this._stepId.set(this._stepId.get() + 1)
    this._moment++;
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
    pass.step = { attempt, previousControlStates };
    // The lock is lifted, and the container closed until the reactions of
    // the step are done: what an observer presents on what it sees waits.
    this.pass = pass;
    const delta = {
      acceptedMutations,
      proposal,
      controlStates: this.currentControlStates,
      previousControlStates,
    };
    return delta;
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
    // So would one while the proposals which waited are given their turn.
    if (this.isBusy) {
      console.warn(
        "[RAVIOLI] Tried to rollback while the container is busy with a step."
      );
      return;
    }

    const stepId = getRollbackStepId(step);

    this.jump(() => {
      reconcile(this.data as unknown as object, step.data);
      this._stepId.set(stepId);
      this._moment++;
      this.currentControlStates.replace(step.delta.controlStates);
      // The buffer and the last attempt belong to the abandoned timeline.
      this.NAPproposalBuffer.clear();
      this.NAPproposalBuffer.setStepId(stepId);
      this._lastAttempt.set(undefined);
    }, () => {
      // Replay the arrival at this step.
      const delta = {
        acceptedMutations: step.delta.acceptedMutations,
        proposal: step.delta.proposal,
        controlStates: this.currentControlStates,
        previousControlStates: step.delta.previousControlStates,
      };
      return delta;
    }, false);
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
    // Same as a rollback: not while the container is busy.
    if (this.isBusy) {
      console.warn(
        "[RAVIOLI] Tried to reset while the container is busy with a step."
      );
      return;
    }

    const stepId = this.options?.initialStepId ?? 0;

    this.jump(() => {
      reconcile(this.data as unknown as object, state);
      this._stepId.set(stepId);
      this._moment++;
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
    // Replay the creation.
    }, () => this.toCreationDelta(), true);
  }

  /**
   * A rollback or a reset: the model is put on another state, then the
   * reactions replay the arrival. The container is closed from the start:
   * what is proposed meanwhile, by whoever listens to the model, waits for
   * them.
   */
  private jump(
    land: () => void,
    toDelta: () => Arrival<MUTATIONS, CONTROL_STATES>,
    isInit: boolean
  ): void {
    const pass = this.pass = toPass(0);
    let hasLanded = false;
    try {
      // Put in this transaction all the needed updates
      // The view won't react until the transaction is finished.
      runInAction(() => {
        land();
        hasLanded = true;
      });
    } finally {
      if (hasLanded) {
        this.react({ data: this.data, delta: toDelta() }, isInit, pass);
      } else {
        // The model did not take it: the container is as open as it was.
        this.pass = undefined;
        this.takeTurns();
      }
    }
  }

  /**
   * The delta of the creation step: nothing was proposed, nothing came before.
   */
  private toCreationDelta(): Arrival<MUTATIONS, CONTROL_STATES> {
    const delta = {
      acceptedMutations: [],
      proposal: [],
      controlStates: this.currentControlStates,
      previousControlStates: [],
    };
    return delta;
  }

  /**
   * Says whether this pass is the one which keeps the container closed.
   */
  private isClosedBy(pass: ReactionPass): boolean {
    return this.pass === pass;
  }

  private async react(
    args: { data: TYPE; delta: Arrival<MUTATIONS, CONTROL_STATES> },
    isInit: boolean,
    pass: Pass<MUTATIONS, CONTROL_STATES> = toPass(0)
  ) {
    // Nobody awaits this pass and nobody can catch it: a throw which escaped
    // here used to leave the container closed, and the instance then refused
    // every later step, rollback and reset for good.
    //
    // Kept inline on purpose. Delegating to an awaited method would push the
    // recovery to the next microtask, and a caller acting synchronously right
    // after the throw would still find the instance closed.
    //
    // The pass of the creation is the only one which runs while the container
    // is open: what its reactions propose is presented at once.
    const isOpen = !this.isClosedBy(pass);
    let handles: { actions: ACTIONS; compose: Compose<ACTIONS, MUTATIONS> } | undefined;
    try {
      // The reactions as they are when the pass starts. Another pass can
      // dispose of a one shot reaction while this one waits: counting in the
      // list itself would then skip the reaction which follows it.
      const reactions = this.stepReactions.slice();
      for (let i = 0; i < reactions.length; i++) {
        const reaction = reactions[i];
        const { runOnInit = true, when: predicate, do: effect, once, debugName, awaitAsync } = reaction;
        // A one shot reaction another pass disposed of meanwhile has had its run.
        if ((isInit && !runOnInit) || this.stepReactions.indexOf(reaction) === -1) {
          continue
        }
        // Filter nap which have already ran on the instance
        if (!predicate || predicate(args)) {
          // Run the reaction
          if (debugName) {
            console.info("[SAM] reaction:", debugName);
          }
          handles = handles || this.toHandles(pass);
          this.reacting = pass;
          const result = effect({ ...args, actions: handles.actions, representation: this.representationRef.current, compose: handles.compose });
          this.reacting = undefined;
          // Await the effect if awaitAsync is set to ensure sequential execution
          if (awaitAsync && isThenable(result)) {
            await result;
          }
          // If it is a one shot reaction, dispose
          if (once) {
            this.disposeReaction(effect);
          }

        }
      }

      if (this.isClosedBy(pass) && this.NAPproposalBuffer.length) {
        this.handOver(pass);
      }
    } catch (error) {
      this.reacting = undefined;
      this.quietly(() => this.reportUnsettled(pass, toUnsettledReason(error)));
    } finally {
      this.quietly(() => this.endPass(pass, isOpen));
    }
  }

  /**
   * A reaction proposed something: the step goes on with it, ahead of
   * whatever waits (SAM's order).
   */
  private handOver(pass: Pass<MUTATIONS, CONTROL_STATES>): void {
    // Nothing says the next pass will propose less, so count the chain and
    // cut it before it eats the stack.
    if (pass.depth >= MAX_NAP_CASCADE) {
      this.stopCascade(pass);
      return;
    }
    this.takeStep(this.NAPproposalBuffer.getTaggedProposal(), {}, pass.depth + 1, pass);
  }

  /**
   * The reactions of a pass are done, or one of them threw.
   */
  private endPass(pass: Pass<MUTATIONS, CONTROL_STATES>, isOpen: boolean): void {
    if (this.isClosedBy(pass)) {
      // Unless the step goes on: the pass of its next link ends the chain.
      this.endChain(pass);
    } else if (isOpen) {
      // What its reactions propose from now on is not of the creation.
      pass.chain.isOver = true;
      if (this.pass === undefined) {
        this.refresh(pass);
      }
    }
  }

  /**
   * Nobody awaits a pass. What throws once its reactions are done, an
   * observer for example, is said on the console and goes no further.
   */
  private quietly(work: () => void): void {
    try {
      work();
    } catch (error) {
      console.error(`[RAVIOLI] ${toUnsettledReason(error).message}`);
    }
  }

  /**
   * The step is over, and the steps its reactions started with it. The
   * container opens again, first for the proposals which waited.
   */
  private endChain(pass: Pass<MUTATIONS, CONTROL_STATES>): void {
    this.pass = undefined;
    pass.chain.isOver = true;
    try {
      this.refresh(pass);
    } finally {
      // Whatever an observer of the representation threw.
      this.takeTurns();
    }
  }

  /**
   * A custom representation follows the model once the step is over, the
   * steps its reactions started included: it never shows a step which may
   * still be taken back.
   */
  private refresh(pass: Pass<MUTATIONS, CONTROL_STATES>): void {
    // Refresh the represenation
    if (this.factory.transformer) {
      try {
        derivate(this.representationRef.current, this.factory.transformer({data: this.data, controlStates: this.currentControlStates}));
      } catch (error) {
        this.reportUnsettled(pass, toUnsettledReason(error));
      }
    }
  }

  /**
   * Give their turn to the proposals which waited, each in a step of its own,
   * in the order they arrived (weak fairness).
   *
   * A loop rather than a recursion: thousands of proposals can wait behind a
   * long step, and every step which ends at once comes back here.
   */
  private takeTurns(): void {
    if (this.isTakingTurns) {
      return;
    }
    this.isTakingTurns = true;
    try {
      let waiting: WaitingProposal<MUTATIONS> | undefined;
      while (this.pass === undefined && (waiting = this.waitingProposals.shift()) !== undefined) {
        this.takeTurn(waiting);
      }
    } finally {
      this.isTakingTurns = false;
    }
  }

  private takeTurn({ proposal, origin, depth }: WaitingProposal<MUTATIONS>): void {
    try {
      // Allowed when it was called is not allowed now.
      if (origin.isAllowed !== undefined && !origin.isAllowed()) {
        return;
      }
      // Waiting is the container's doing, it does not make a proposal stale.
      // Unless its action is cancelable: that one claims the moment it was
      // called at.
      if (origin.calledAt === undefined) {
        proposal.stepId = this._stepId.get();
      }
      this.takeStep(proposal, origin, depth);
    } catch (error) {
      // Whoever called the action is long gone.
      console.error(`[RAVIOLI] ${toUnsettledReason(error).message}`);
    }
  }

  /**
   * The reactions kept proposing. Drop what they were about to present and say
   * so, rather than recursing until the stack gives up.
   */
  private stopCascade(pass: Pass<MUTATIONS, CONTROL_STATES>): void {
    this.NAPproposalBuffer.clear();
    this.NAPproposalBuffer.setStepId(this._stepId.get());
    this.reportUnsettled(pass, toRunawayReason());
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
 * A pass of the step reactions, with what is needed to end it.
 */
type Pass<MUTATIONS, CONTROL_STATES> = ReactionPass & {
  /**
   * The step it reacts to. None for the pass of the creation, of a rollback
   * or of a reset.
   */
  step?: RunningStep<MUTATIONS, CONTROL_STATES>;
};

/**
 * What the container holds for a pass while a proposal is presented: no step
 * is taken yet, and none can be asked for.
 */
const PRESENTING: Pass<any, any> = toPass(0);

/**
 * A pass which reacts to no step yet. It is of the chain of steps it is
 * given, or starts one.
 */
function toPass(depth: number, chain = { isOver: false }) {
  return { depth, chain };
}

/**
 * A step whose reactions are running, with what is needed to take it back.
 */
type RunningStep<MUTATIONS, CONTROL_STATES> = {
  attempt: AcceptedAttempt<MUTATIONS>;
  previousControlStates: CONTROL_STATES[];
};

type AcceptedAttempt<MUTATIONS> = Extract<Attempt<MUTATIONS>, { status: "accepted" }>;

/**
 * What the step reactions are told of the step they react to.
 */
type Arrival<MUTATIONS, CONTROL_STATES> = {
  acceptedMutations: MUTATIONS[];
  proposal: TaggedProposal;
  controlStates: IObservableArray<CONTROL_STATES>;
  previousControlStates: CONTROL_STATES[];
};

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

function toRunawayReason(): Reason {
  return {
    code: RejectionCode.reactionsDidNotSettle,
    message: `The step reactions did not settle after ${MAX_NAP_CASCADE} steps.`,
    meta: { steps: MAX_NAP_CASCADE },
  };
}

/**
 * A promise, or what is awaited as one: what a query builder hands back, a
 * promise made in another realm.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  const held = Object(value);
  return held === value && typeof held.then === "function";
}

function toUnsettledReason(error: unknown): Reason {
  return {
    code: RejectionCode.reactionThrew,
    message: error instanceof Error ? error.message : String(error),
    meta: { error },
  };
}
