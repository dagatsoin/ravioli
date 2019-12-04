import { Proposal } from './IPresentable'

export enum ActionType {
  update = 'update',
}

export type Intent<P> = {
  type: ActionType
  payload: P
}

export type Action<MUTATION_PAYLOADS> = (
  payload: any
) => Proposal<MUTATION_PAYLOADS>

export type ActionIntent = (payload: any) => void

export type ActionPackages<MUTATION_PAYLOADS> = {
  [key: string]: ActionPackage<MUTATION_PAYLOADS>
}

export type ActionPackage<MUTATION_PAYLOADS> = {
  isAllowed: (
    model: any,
    acceptedMutations: any,
    patch: any,
    controlState: any,
    previousModel: any,
    previousControlState: any
  ) => boolean
  action: Action<MUTATION_PAYLOADS>
}

export type ModelActions = {
  [key: string]: Action<any>
}

export type Actions<I extends ActionPackages<any>> = {
  [key in keyof I]: I[key]['action']
}

export type ActionsBinder = <I extends ActionPackages<any>>(
  packages: I
) => Actions<I>
