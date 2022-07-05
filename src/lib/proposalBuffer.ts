import { IProposalBuffer, TaggedProposal } from "./api/presentable";

class ProposalBuffer<MUTATIONS> implements IProposalBuffer<MUTATIONS> {
  private stepId?: number;
  private mutations: MUTATIONS[] = [];

  public get length() {
    return this.mutations.length;
  }
  public setStepId(stepId: number) {
    this.stepId = stepId;
  }
  public push(mutations: MUTATIONS[]): void {
    this.mutations.push(...mutations);
  }
  public getTaggedProposal(): TaggedProposal<MUTATIONS> {
    return Object.assign(this.mutations, { stepId: this.stepId });
  }

  public clear(): void {
    this.stepId = undefined;
    this.mutations = [];
  }
}

export function createNAPProposalBuffer<
  MUTATIONS
>(): IProposalBuffer<MUTATIONS> {
  return new ProposalBuffer();
}
