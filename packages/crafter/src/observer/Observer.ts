import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'

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
  public get id(): string {
    return this._id
  }

  protected context: IContainer
  protected _isStale = true
  private _id: string  
  
  public abstract dependencyPaths: string[];
  public abstract isStale: boolean;
  public abstract type: ObserverType;

  constructor({
    id,
    type,
    context
  }: {
    type: ObserverType,
    id?: string,
    context?: IContainer
  }) {
    this.context = context || getGlobal().$$crafterContext
    if (id) {
      if (!this.context.isUID(id)) {
        throw new Error(`UID ${id} is already in use`)
      }
      this._id = id
    } else {
      this._id = this.context.getUID(toString(type) + '#')
    }
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
 * - reaction
 */
export function isReaction(observer: IObserver): boolean {
  return observer.type === ObserverType.Autorun || observer.type === ObserverType.Reaction
}

function toString(type: ObserverType): string {
  switch (type) {
    case ObserverType.Autorun:
      return 'Autorun'
    case ObserverType.Computed:
      return 'Computed'
    case ObserverType.Reaction:
      return 'Reaction'
  }
}