import { IObservable, IObservableArray, observable, runInAction } from "mobx";
import { IInstance } from "../api";
import { Acceptor, Mutation } from "./api/acceptor";
import { ActionContext, PackagedActions } from "./api/action";
import { IProposalBuffer, Proposal, SAMLoop, TaggedProposal } from "./api/presentable";
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
        if (this.factory.transformer) {
            this.representationRef.current = observable(this.factory.transformer(this.data));
        }
        // Or assign the model as the representation one for all.
        else {
            this.representationRef.current = (this.data as any) as REPRESENTATION & IObservable
        }
    }
    private data: TYPE;
    
    private _stepId = observable.box(0);
    public get stepId(): number {
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
      { stepId: this.stepId }
    );
    this.startStep(taggedProposal);
  };

  public startStep(proposal: TaggedProposal): void {
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
          data: this.data,
          acceptedMutations,
          previousControlStates: this.controlStates.slice(),
          controlStatePredicates: this.factory.controlStatePredicates,
          keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
        })
      );
    });

    this.isRunningNAP = true;

    // Defer representation update if there is some extra proposal to handle.
    if (this.factory.transformer && (!this.options?.debounceReaction ?? true)) {
      derivate(this.representationRef.current, this.factory.transformer(this.data));
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
    this.factory.stepReactions.forEach(({ reaction }) => {
      // Filter nap which have already ran on the instance
      if (!reaction.predicate || reaction.predicate(args)) {
        reaction.effect({ ...args, actions: this.actions });
      }
    });

    this.isRunningNAP = false;

    if (this.NAPproposalBuffer.length) {
      this.startStep(this.NAPproposalBuffer.getTaggedProposal());
    }

    // Refresh the represenation
    if (this.factory.transformer) {
      derivate(this.representationRef.current, this.factory.transformer(this.data));
    }
  }

  private present(proposal: Proposal<MUTATIONS>): MUTATIONS[] {
    return proposal.filter(({ type, payload }) => {
      console.log(type)
      // Acceptor exists
      const acceptor: Acceptor<any, any> | undefined = this.factory.acceptors[type];
      // Acceptor condition
      if (acceptor.condition === undefined || acceptor.condition(payload)) {
        // Do the mutation
        acceptor.mutator(this.data, payload);
        return true;
      }
      return false;
    });
  }
}