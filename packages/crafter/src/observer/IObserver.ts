import { Patch } from '../lib/JSONPatch'

export enum ObserverType {
  Autorun,
  Computed,
  Reaction,
}
export interface IObserver {
  id: string
  dependencies: string[]
  type: ObserverType
  readonly isStale: boolean
  dispose: () => void
  notifyChanges(patch: Patch<any>, updatedObservablePaths: string[]): void
  runAndUpdateDeps(): void
}
