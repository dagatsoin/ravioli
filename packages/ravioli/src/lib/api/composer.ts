import { Proposal } from "./presentable";
import { Attempt } from "./rejection";

type ActionComposer<ACTIONS, MUTATIONS> = 
| ((actions: ACTIONS) => Proposal<MUTATIONS>[])
| Proposal<MUTATIONS>[];

export type Compose<ACTIONS, MUTATIONS> = (composer: ActionComposer<ACTIONS, MUTATIONS>) => void

/**
 * The actions, each one answering what becomes of its proposal where the
 * action itself answers nothing. And, called with a composer, a proposal
 * composed as `compose` does. Either way the author gets the outcome of that
 * attempt.
 */
export type AttemptCall<ACTIONS, MUTATIONS> = AttemptActions<ACTIONS, MUTATIONS> &
  ((composer: ActionComposer<ACTIONS, MUTATIONS>) => Promise<Attempt<MUTATIONS>>);

type AttemptActions<ACTIONS, MUTATIONS> = [ACTIONS] extends [never]
  ? unknown
  : {
      [NAME in keyof ACTIONS]: ACTIONS[NAME] extends (...args: infer ARGS) => any
        ? (...args: ARGS) => Promise<Attempt<MUTATIONS>>
        : never;
    };