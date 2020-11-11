import { Patch } from '../lib/JSONPatch'

export enum ObserverType {
  Autorun,
  Derivation,
  Reaction,
}
export interface IObserver {
  id: string
  type: ObserverType
  readonly dependencies: string[]
  readonly isStale: boolean
  dispose: () => void
  notifyChanges(patch: Patch<any>, updatedObservablePaths: string[]): void
  runAndUpdateDeps(): void
}
