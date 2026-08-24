import { Proposal } from "./presentable";

type ActionComposer<ACTIONS, MUTATIONS> = 
| ((actions: ACTIONS) => Proposal<MUTATIONS>[])
| Proposal<MUTATIONS>[];

export type Compose<ACTIONS, MUTATIONS> = (composer: ActionComposer<ACTIONS, MUTATIONS>) => void