import { IObservable, IObservableArray, IObservableValue, observable, runInAction, untracked } from "mobx";
import { IInstance } from "../api";
import { Acceptor, Mutation } from "./api/acceptor";
import { IProposalBuffer, Proposal, SAMLoop, Step, TaggedProposal } from "./api/presentable";
import { Author, Origin, ReactionPass } from "./origin";
import { StepReaction } from "./api/stepReaction";
import { ContainerFactory, ContainerOption } from "./container";
import { getControlStates } from "./controlState";
import { derivate, reconcile } from "./derivate";
import { IProposalQueue, WaitingProposal, createNAPProposalBuffer, createProposalQueue } from "./proposalBuffer";
import { Patch } from "./api/patch";
import { IStepRecorder, StepPatches, createStepRecorder } from "./stepRecorder";
import { AttemptCall, Compose } from "./api/composer";
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

        // Only a reaction reads the patches of a step, and only the failure of
        // one takes a step back. Without any, the model is not listened to.
        if (reactions.length) {
          this.stepRecorder = createStepRecorder(this.data as unknown as object)
        }

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
    private stepRecorder?: IStepRecorder;
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
      const attempt: Attempt<MUTATIONS> = {
        status: "discarded",
        attemptedAt: this._stepId.get(),
        reason,
      };
      try {
        runInAction(() => {
          this._lastAttempt.set(attempt);
        });
      } finally {
        // Whatever an observer of the last attempt throws.
        origin?.author?.tell(attempt);
      }
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
      // The first reason is the one which is told.
      if (pass.toTell !== undefined && pass.toTell.attempt.settled) {
        pass.toTell.attempt = { ...pass.toTell.attempt, settled: false, reason };
      }
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

    /**
     * Present a proposal and tell its author what became of it, once nothing
     * can change it anymore.
     *
     * It is not what the actions return: a reaction written
     * `do: ({ actions }) => actions.heal()` hands back what the action returns,
     * and an awaited one would wait for a step which waits for it.
     */
    public attempt: AttemptCall<ACTIONS, MUTATIONS> = this.toAttempt();

    private toAttempt(): AttemptCall<ACTIONS, MUTATIONS> {
      const call = (composer: Parameters<Compose<ACTIONS, MUTATIONS>>[0]) =>
        this.ask((origin) => this.startStep(this.toTaggedProposal(composer), origin));
      // Bound: a bound function has no prototype, even once compiled to ES5,
      // and an action can be called `prototype` as well.
      const attempt = call.bind(undefined);
      Object.keys(this.factory.wrapedActions).forEach((name) => {
        // Defined, not assigned: an action can be called `name` or `length`,
        // which a function has already and does not let be written.
        Object.defineProperty(attempt, name, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: (...args: any[]) =>
            this.ask((origin) => this.factory.wrapedActions[name](this, origin)(...args)),
        });
      });
      return attempt as AttemptCall<ACTIONS, MUTATIONS>;
    }

    /**
     * Have a proposal presented for an author, who is told what becomes of it.
     */
    private ask(present: (origin: Origin<MUTATIONS>) => unknown): Promise<Attempt<MUTATIONS>> {
      return new Promise<Attempt<MUTATIONS>>((tell, fail) => {
        // An asynchronous action which throws does it in its own promise.
        Promise.resolve(untracked(() => present({ author: { tell, fail } }))).catch(fail);
      });
    }

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
   *
   * The same while a rollback or a reset puts its state in the model.
   */
  public refuseIfLocked(origin?: Origin<MUTATIONS>): boolean {
    if (this.pass !== PRESENTING && this.pass !== LANDING) {
      return false;
    }
    const message = this.pass === PRESENTING
      ? "A proposal is already being presented."
      : "The container is being rolled back or reset.";
    console.info(`[RAVIOLI] Tried to present a proposal while it is locked. ${message}`);
    this.discardProposal({ code: RejectionCode.stepLocked, message }, origin);
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
      if (pass !== undefined && this.isClosedBy(pass) && origin.author === undefined) {
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
    // A reaction which asks what becomes of what it proposes gets a step of
    // its own each time: a chain it keeps going that way is cut here.
    if (depth > MAX_NAP_CASCADE) {
      const reason = toRunawayReason();
      console.error(`[RAVIOLI] ${reason.message}`);
      this.discardProposal(reason, origin);
      return;
    }

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
        this.stepRecorder?.start();
        try {
          delta = this.accept(proposal, origin, pass, from);
        } finally {
          if (delta === undefined) {
            // No step: nothing to take back, and the container is as open
            // as it was. Not later: an observer which acts on a refusal, at
            // the end of the transaction, is not locked out.
            this.endRecord();
            this.pass = before;
          }
        }
      });
    } catch (error) {
      // Whoever asked what becomes of the step is told at its end, as for
      // any step: what an observer throws is not their outcome.
      if (delta === undefined || origin.author === undefined) {
        throw error;
      }
      console.error(`[RAVIOLI] ${toUnsettledReason(error).message}`);
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
      origin.author?.tell(attempt);
      return undefined;
    }
    // What the acceptors wrote, and nothing of what is written later.
    const patches = this.stepRecorder === undefined ? NO_PATCHES : this.stepRecorder.read();
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
    // A step the reactions started has no author: the one of the step
    // which started the chain waits for it too.
    pass.toTell = origin.author ? { author: origin.author, attempt } : from?.toTell;
    // The lock is lifted, and the container closed until the reactions of
    // the step are done: what an observer presents on what it sees waits.
    this.pass = pass;
    const delta = {
      acceptedMutations,
      proposal,
      controlStates: this.currentControlStates,
      previousControlStates,
    };
    return withPatches(delta, patches);
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
      return withPatches(delta, step.delta);
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
   * reactions replay the arrival. The container is locked while the state is
   * put in the model, as it is while a proposal is presented: what whoever
   * listens to the model sends meanwhile is discarded. The reactions which
   * replay the arrival are not locked: they propose as they do.
   */
  private jump(
    land: () => void,
    toDelta: () => Arrival<MUTATIONS, CONTROL_STATES>,
    isInit: boolean
  ): void {
    const pass = toPass(0);
    this.pass = LANDING;
    let hasLanded = false;
    try {
      // Put in this transaction all the needed updates
      // The view won't react until the transaction is finished.
      runInAction(() => {
        try {
          land();
          hasLanded = true;
        } finally {
          // The lock is lifted before the transaction ends: an observer
          // which acts at its end waits for the reactions which replay the
          // arrival. When the model did not take the state, it finds the
          // container as open as it was.
          this.pass = hasLanded ? pass : undefined;
        }
      });
    } finally {
      if (hasLanded) {
        this.react({ data: this.data, delta: toDelta() }, isInit, pass);
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
    return withPatches(delta, NO_PATCHES);
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
    // What takes the step back should the running reaction fail: nothing,
    // unless that reaction is awaited.
    let recorder: IStepRecorder | undefined;
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
          recorder = awaitAsync ? this.stepRecorder : undefined;
          this.reacting = pass;
          const result = effect({ ...args, actions: handles.actions, representation: this.representationRef.current, compose: handles.compose });
          this.reacting = undefined;
          // Await the effect if awaitAsync is set to ensure sequential execution
          if (awaitAsync && isThenable(result)) {
            await result;
          }
          recorder = undefined;
          // If it is a one shot reaction, dispose
          if (once) {
            // With the place it had, should the step be taken back.
            const at = this.stepReactions.indexOf(reaction);
            if (this.disposeReaction(effect)) {
              pass.disposed.push([at, reaction]);
            }
          }

        }
      }

      if (this.isClosedBy(pass) && this.NAPproposalBuffer.length) {
        this.handOver(pass);
      }
    } catch (error) {
      this.reacting = undefined;
      this.quietly(() => this.failPass(pass, toUnsettledReason(error), recorder));
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
    // The step stands for good: the next one has a record of its own.
    this.endRecord();
    this.takeStep(this.NAPproposalBuffer.getTaggedProposal(), {}, pass.depth + 1, pass);
  }

  /**
   * A reaction threw. When it was awaited, what the step was waiting for did
   * not happen: the step is taken back. Otherwise the step stands, and only
   * its consequences did not happen.
   */
  private failPass(
    pass: Pass<MUTATIONS, CONTROL_STATES>,
    reason: Reason,
    recorder: IStepRecorder | undefined
  ): void {
    if (recorder !== undefined && pass.step !== undefined) {
      this.undoStep(pass, pass.step, recorder, reason);
    } else {
      this.reportUnsettled(pass, reason);
    }
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
   * An awaited reaction failed: what the step was waiting for, a write for
   * example, did not happen. The step is taken back rather than leaving the
   * model ahead of it. What its reactions did before is done.
   *
   * All or nothing: when the model can not be taken back whole, the step
   * stands whole, and that is what is reported.
   */
  private undoStep(
    pass: Pass<MUTATIONS, CONTROL_STATES>,
    { attempt, previousControlStates }: RunningStep<MUTATIONS, CONTROL_STATES>,
    recorder: IStepRecorder,
    reason: Reason
  ): void {
    const stepId = attempt.attemptedAt;
    const undone: AcceptedAttempt<MUTATIONS> = { ...attempt, settled: false, reason, undone: true };
    // What waited behind the step was meant for a state which is gone. What
    // arrives once the model is back is not.
    let refused: IProposalQueue<MUTATIONS> | undefined;
    let failure: unknown;
    console.error(`[RAVIOLI] ${reason.message}`);

    // One transaction: the observers see it all come back at once. What one
    // of them throws once it is told is said on the console, and the author
    // is told all the same.
    this.quietly(() => runInAction(() => {
      // The control states first, and not computed again: one which depends
      // on the past could not be. Should whoever is asked refuse them,
      // nothing of the model has moved yet.
      const states = this.currentControlStates.slice();
      try {
        this.quietly(() => this.currentControlStates.replace(previousControlStates));
        if (!isSameList(this.currentControlStates, previousControlStates)) {
          throw new Error("the control states were kept from coming back");
        }
        recorder.undo();
      } catch (error) {
        failure = error;
        // All or nothing: the step stands, with the control states it has.
        this.quietly(() => this.currentControlStates.replace(states));
        return;
      }
      // A one shot reaction which ran in it has not had its run.
      pass.disposed.reverse().forEach(([index, reaction]) => {
        this.stepReactions.splice(index, 0, reaction);
      });
      refused = this.waitingProposals;
      this.waitingProposals = createProposalQueue<MUTATIONS>();
      this._stepId.set(stepId);
      this._lastAttempt.set(undone);
    }));

    if (refused === undefined) {
      this.reportUnsettled(pass, {
        code: RejectionCode.stepNotUndone,
        message: `An awaited reaction failed and the step ${stepId + 1} could not be taken back: ${toUnsettledReason(failure).message}.`,
        meta: { reason, error: failure },
      });
      return;
    }

    // The step first, then what waited behind it. A step whose reactions
    // started this one stands: only its consequences did not happen.
    if (pass.toTell !== undefined) {
      const { author } = pass.toTell;
      author.tell(pass.toTell.attempt === attempt ? undone : { ...pass.toTell.attempt, settled: false, reason });
    }

    for (let waiting = refused.shift(); waiting !== undefined; waiting = refused.shift()) {
      const { origin } = waiting;
      this.quietly(() => this.discardProposal({
        code: RejectionCode.precedingStepUndone,
        message: `The step ${stepId + 1} was undone: what waited behind it was not presented.`,
        meta: { stepId: stepId + 1, reason },
      }, origin));
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
      this.endRecord();
      this.refresh(pass);
    } finally {
      // Whatever an observer of the representation threw.
      if (pass.toTell !== undefined) {
        pass.toTell.author.tell(pass.toTell.attempt);
      }
      this.takeTurns();
    }
  }

  /**
   * Nothing of the step is taken back from here.
   */
  private endRecord(): void {
    this.stepRecorder?.stop();
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
      if (origin.author !== undefined) {
        origin.author.fail(error);
      } else {
        console.error(`[RAVIOLI] ${toUnsettledReason(error).message}`);
      }
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
  /**
   * Who asked what becomes of the step the chain started with, and what they
   * are told when the chain is over.
   */
  toTell?: { author: Author<MUTATIONS>; attempt: AcceptedAttempt<MUTATIONS> };
  /**
   * The one shot reactions it disposed of, with the place each one had.
   */
  disposed: Array<[number, StepReaction<any, any, any, any, any>]>;
};

/**
 * What the container holds for a pass while a proposal is presented: no step
 * is taken yet, and none can be asked for.
 */
const PRESENTING: Pass<any, any> = toPass(0);

/**
 * What it holds while a rollback or a reset puts its state in the model: the
 * same lock, for another reason.
 */
const LANDING: Pass<any, any> = toPass(0);

/**
 * A pass which reacts to no step yet. It is of the chain of steps it is
 * given, or starts one.
 */
function toPass(depth: number, chain = { isOver: false }) {
  return { depth, chain, disposed: [] };
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
  patches: Patch[];
  inversePatches: Patch[];
};

/**
 * What a step tells of its patches when nothing recorded it.
 */
const NO_PATCHES: StepPatches = { patches: [], inversePatches: [] };

/**
 * The patches are on the delta without being listed in it. Whoever goes
 * through a delta, to copy it or to write it down as a 1.7 program does, does
 * not read them. They are written when they are read by name, not for every
 * step. A program which writes its own there, for the reaction which follows,
 * finds what it wrote.
 */
function withPatches<DELTA extends object>(delta: DELTA, source: object) {
  // A step built by hand, to roll back to, has none.
  const patches: Partial<StepPatches> = source;
  const define = (name: "patches" | "inversePatches") =>
    Object.defineProperty(delta, name, {
      configurable: true,
      get: () => patches[name] || [],
      set: (value) => {
        Object.defineProperty(delta, name, { value, writable: true, enumerable: true, configurable: true });
      },
    });
  define("patches");
  define("inversePatches");
  return delta as DELTA & StepPatches;
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

function isSameList<T>(one: T[], other: T[]): boolean {
  return one.length === other.length && one.every((item, at) => item === other[at]);
}

function toUnsettledReason(error: unknown): Reason {
  return {
    code: RejectionCode.reactionThrew,
    message: error instanceof Error ? error.message : String(error),
    meta: { error },
  };
}
