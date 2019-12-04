export interface IObserver {
  $id: string
  dependenciesPath: string[]
  isStale: boolean
  type: ObserverType
  dispose: () => void
  isDependent(observableId: string): boolean
  runAndUpdateDeps(): void
}

export enum ObserverType {
  Autorun,
  Computed,
}

/**
 * Return true if the ovserver is a root:
 * - autorun
 */
export function isRootObserver(observer: IObserver): boolean {
  return observer.type === ObserverType.Autorun
}
