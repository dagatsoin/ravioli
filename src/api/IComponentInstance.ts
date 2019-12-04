import { Actions } from './Action'

export interface IComponentInstance<
  ACTIONS extends Actions<any>,
  REPRESENTATION
> {
  state: State<REPRESENTATION>
  actions: ACTIONS
}

export interface ITransformable<TRANSFORMATION> {
  transformation: TRANSFORMATION
}

type IntentCreators<ACTIONS> = { [K in keyof ACTIONS]: ACTIONS[K] }

export type State<REPRESENTATION> = {
  representation: REPRESENTATION
  controlState: string
}
