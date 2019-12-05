import { TaggedProposal } from '../api'

export interface IProposalBuffer<MUTATION> {
  stepId?: string
  readonly mutations: MUTATION[]
  push(mutations: MUTATION[]): void
  getTaggedProposal(): TaggedProposal<MUTATION>
  clear(): void
}

class NAPProposalBuffer<MUTATION> implements IProposalBuffer<MUTATION> {
  public stepId?: string
  public mutations: MUTATION[] = []
  constructor(args?: { stepId?: string; mutations?: MUTATION[] }) {
    this.stepId = args?.stepId
    this.mutations = args?.mutations ?? []
  }
  public push(mutations: MUTATION[]): void {
    this.mutations.push(...mutations)
  }
  public getTaggedProposal(): TaggedProposal<MUTATION> {
    return Object.assign(this.mutations, { stepId: this.stepId })
  }
  public clear(): void {
    this.stepId = undefined
    this.mutations = []
  }
}

export function createNAPProposalBuffer<MUTATION>(args?: {
  stepId?: string
  mutations?: MUTATION[]
}): IProposalBuffer<MUTATION> {
  return new NAPProposalBuffer(args)
}
