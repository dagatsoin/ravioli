import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { IComputed } from './IDerivation';

export interface IObserver {
  id: string
  dependencies: string[]
  readonly isStale: boolean
  readonly isObserver: true
  type: ObserverType
  dispose: () => void
  stale(): void
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
  public dependencies: string[] = [];
  public isObserver: true = true
  protected context: IContainer
  protected _isStale = true
  private _id: string  
  

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
  public stale(): void {
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
export function isReaction(type: ObserverType): boolean {
  return type === ObserverType.Autorun || type === ObserverType.Reaction
}

export function isDerivation(observer: any): observer is IComputed<any> {
  return observer.type === ObserverType.Computed
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

export function isObserver(thing: any): thing is IObserver {
  return thing.isObserver
}