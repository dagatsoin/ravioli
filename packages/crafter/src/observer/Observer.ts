import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
// import { Operation } from '../lib/JSONPatch'

export interface IObserver {
  id: string
  dependencyPaths: string[]
  readonly isStale: boolean
  type: ObserverType
  dispose: () => void
  notifyChangeFor(): void
  runAndUpdateDeps(): void
}

export enum ObserverType {
  Autorun,
  Computed,
  Reaction
}

export abstract class Observer implements IObserver {
  public id: string;
  public dependencyPaths: string[];
  public isStale: boolean;
  public type: ObserverType;
  protected context: IContainer
  protected _isStale = true

  constructor(idPrefix: string, context?: IContainer) {
    this.context = context || getGlobal().$$crafterContext
    this.id = idPrefix + this.context.getUID()
    this.context.useUID(this.id)
  }
  public notifyChangeFor(): void {
    this._isStale = true
  }

  public abstract dispose(): void
  public abstract runAndUpdateDeps(): void

}

/**
 * Return true if the ovserver is a root:
 * - autorun
 */
export function isRootObserver(observer: IObserver): boolean {
  return observer.type === ObserverType.Autorun
}
