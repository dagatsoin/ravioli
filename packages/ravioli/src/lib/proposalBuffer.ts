import { IProposalBuffer, TaggedProposal } from "./api/presentable";
import { Origin } from "./origin";

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

/**
 * A proposal which was presented while the container was busy.
 */
export type WaitingProposal<MUTATIONS> = {
  proposal: TaggedProposal<MUTATIONS>;
  origin: Origin<MUTATIONS>;
  /**
   * How many steps in a row the reactions started to get to it. None when it
   * does not come from a reaction.
   */
  depth: number;
};

/**
 * The proposals which wait for their turn, in the order they arrived.
 */
export interface IProposalQueue<MUTATIONS> {
  push(waiting: WaitingProposal<MUTATIONS>): void;
  /**
   * The proposal which waited the longest, if one waits.
   */
  shift(): WaitingProposal<MUTATIONS> | undefined;
}

/**
 * One proposal of the queue, and the one which arrived right after it.
 */
type Link<MUTATIONS> = {
  waiting: WaitingProposal<MUTATIONS>;
  next?: Link<MUTATIONS>;
};

/**
 * A chain rather than a list: taking the first proposal of a list moves all
 * the others, which costs as much as the list is long.
 */
class ProposalQueue<MUTATIONS> implements IProposalQueue<MUTATIONS> {
  private first?: Link<MUTATIONS>;
  private last?: Link<MUTATIONS>;

  public push(waiting: WaitingProposal<MUTATIONS>): void {
    const link: Link<MUTATIONS> = { waiting };
    if (this.last === undefined) {
      this.first = link;
    } else {
      this.last.next = link;
    }
    this.last = link;
  }
  public shift(): WaitingProposal<MUTATIONS> | undefined {
    const link = this.first;
    if (link === undefined) {
      return undefined;
    }
    this.first = link.next;
    if (this.first === undefined) {
      this.last = undefined;
    }
    return link.waiting;
  }
}

export function createProposalQueue<MUTATIONS>(): IProposalQueue<MUTATIONS> {
  return new ProposalQueue();
}
