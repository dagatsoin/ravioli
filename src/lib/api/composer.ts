import { Proposal } from "./presentable";

export type ActionComposer<ACTIONS, MUTATIONS> = (
  actions: ACTIONS
) => Proposal<MUTATIONS>[];
