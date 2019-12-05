export interface ISAMLoop {
  startStep: StartStep
}

export type Proposal<MUTATION> = MUTATION[]

export type TaggedProposal<MUTATION = any> = Proposal<MUTATION> & {
  stepId?: string
}

export type StartStep = Present

export type Present = (proposal: TaggedProposal<any>) => void
