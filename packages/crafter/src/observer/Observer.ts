import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { IComputed } from './IDerivation';
import { Patch, isDependent } from '../lib/JSONPatch';
import { IObserver, ObserverType } from './IObserver';

export abstract class Observer implements IObserver {
  public get id(): string {
    return this._id
  }
  public dependencies: string[] = [];
  public isObserver: true = true
  protected context: IContainer
  protected isStale = true
  private _id: string  
  
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

  public notifyChanges(patch: Patch<any>, updatedObservablePaths: string[]) {
    this.isStale = patch.some(command => isDependent(this, command, updatedObservablePaths))
    if (this.isStale) {
      this.runAndUpdateDeps()
    }
  }

  public abstract dispose(): void
  public abstract runAndUpdateDeps(): void
}

/**
 * Return true if the ovserver is a root:
 * - autorun
 * - reaction
 */
export function isReaction(observer: any): boolean {
  return observer.type === ObserverType.Autorun || observer.type === ObserverType.Reaction
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