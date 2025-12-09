export interface SAMLoop {
  startStep: StartStep;
}

export type Proposal<MUTATION> = MUTATION[];

export type TaggedProposal<MUTATION = any> = Proposal<MUTATION> & {
  stepId?: number;
};

export type StartStep = Present;

export type Present = (proposal: TaggedProposal<any>) => void;

export type Delta<MUTATION, CONTROL_STATES_PREDICATES> = {
  acceptedMutations: MUTATION[];
  proposal: Proposal<MUTATION>;
  controlStates: CONTROL_STATES_PREDICATES[];
  previousControlStates: CONTROL_STATES_PREDICATES[];
};

export interface IProposalBuffer<MUTATIONS> {
  length: number;
  setStepId(stepId: number): void;
  getTaggedProposal(): TaggedProposal<MUTATIONS>;
  push(mutations: MUTATIONS[]): void;
  clear(): void;
}
