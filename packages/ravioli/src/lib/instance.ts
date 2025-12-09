import { computed, IComputedValue, IObservable, IObservableArray, observable, runInAction } from "mobx";
import { IInstance } from "../api";
import { Acceptor, Mutation } from "./api/acceptor";
import { IProposalBuffer, Proposal, SAMLoop, TaggedProposal } from "./api/presentable";
import { StepReaction } from "./api/stepReaction";
import { ContainerFactory, ContainerOption } from "./container";
import { getControlStates } from "./controlState";
import { derivate } from "./derivate";
import { createNAPProposalBuffer } from "./proposalBuffer";

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
        // The data is now observable
        // ISSUE: do we need make it observable?
        this.data  = (observable(data as Record<string, unknown>) as unknown) as TYPE;

        this.stepReactions = [...reactions]

        // Bind action to instance
        Object.keys(factory.wrapedActions).map((k) => {
            const key = k as keyof ACTIONS
            (this.actions[key] as any) = factory.wrapedActions[k]?.(this)
        })

        // Get the initial control states
        this.currentControlStates.replace(
            getControlStates<CONTROL_STATES>({
            data: this.data,
            acceptedMutations: [],
            previousControlStates: [],
            controlStatePredicates: this.factory.controlStatePredicates,
            keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
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
    private _stepId = observable.box(0)
    public get stepId() {
      return this._stepId.get();
    }
    
    private currentControlStates: IObservableArray<CONTROL_STATES> = observable([]);    
    public get controlStates(): CONTROL_STATES[] {
        return this.currentControlStates;
      }

    private NAPproposalBuffer: IProposalBuffer<any> = createNAPProposalBuffer<any>();
    private isRunningNAP = false;  

    /**
    * Agreggate proposal of multiple actions for the same step.
    */
    compose = (
        composer: (originalActions: ACTIONS) => Proposal<MUTATIONS>[]
    ) => {
    const taggedProposal: TaggedProposal = Object.assign(
      composer(this.factory.originalActions as unknown as ACTIONS).reduce(
        (mutations, proposal) => mutations.concat(proposal),
        []
      ),
      { stepId: this._stepId.get() }
    );
    this.startStep(taggedProposal);
  };

  public startStep(proposal: TaggedProposal): void {
    // The proposal should be tagged with the current step ID
    // If not, that means that is an old payload and the presentation is not possible.

    if (proposal.stepId !== this._stepId.get()) {
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
    let didUpdate = false
    runInAction(() => {
      acceptedMutations.push(...this.present(proposal));

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
          keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
        })
      );
      didUpdate = true
    });

    if (didUpdate) {
      this.isRunningNAP = true;

      // Defer representation update if there is some extra proposal to handle.
      if (this.factory.transformer && (!this.options?.debounceReaction ?? true)) {
        derivate(this.representationRef.current, this.factory.transformer({data: this.data, controlStates: this.currentControlStates}));
      }

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

  private react(
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
    for (let i = 0; i < this.stepReactions.length; i++) {
      const { runOnInit = true, when: predicate, do: effect, once, debugName } = this.stepReactions[i];
      if (isInit && !runOnInit) {
        continue
      }
      // Filter nap which have already ran on the instance
      if (!predicate || predicate(args)) {
        // Run the reaction
        if (debugName) {
          console.info("[SAM] reaction:", debugName);
        }
        effect({ ...args, actions: this.actions, representation: this.representationRef.current });
        // If it is a one shot reaction, dispose
        if (once) {
          const didDelete = this.disposeReaction(effect);
          if (didDelete) {
            i--; // Step back the cursor to compensate the last deleted item.
          }
        }

      }
    }

    this.isRunningNAP = false;

    if (this.NAPproposalBuffer.length) {
      this.startStep(this.NAPproposalBuffer.getTaggedProposal());
    }

    // Refresh the represenation
    if (this.factory.transformer) {
      derivate(this.representationRef.current, this.factory.transformer({data: this.data, controlStates: this.currentControlStates}));
    }
  }

  private present(proposal: Proposal<MUTATIONS>): MUTATIONS[] {
    return proposal.filter(({ type, payload }) => {
      // Acceptor exists
      const acceptor: Acceptor<any, any> | undefined = this.factory.acceptors[type];
      // Acceptor condition
      if (acceptor.condition === undefined || acceptor.condition(this.data, payload)) {
        // Do the mutation
        acceptor.mutator(this.data, payload);
        return true;
      }
      return false;
    });
  }
}