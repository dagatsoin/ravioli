import { IObservable } from '../IObservable'
import { Migration } from './JSONPatch'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'

export interface ITracker {
  reportObserved(): void
  reportChanged(): void
}

export class Tracker implements IObservable<unknown>, ITracker {
  public $isObservable: true
  public $patch: Migration<any, any> = {
    forward: [],
    backward: [],
  }

  private context: IContainer
  private id: string
  public get $id(): string {
    return this.id
  }

  constructor(idPrefix: string = '', context?: IContainer) {
    this.context = context || getGlobal().$$crafterContext
    this.id = idPrefix + '#' + this.context.getUID()
    this.context.useUID(this.id)
  }

  public $transactionDidEnd(): void {}

  public reportObserved(): void {
    this.context.addObservedPath(this.id)
  }

  public reportChanged(): void {
    this.context.transaction(() => this.context.addUpdatedObservable(this))
  }
}

export function createTracker(idPrefix: string = '', context?: IContainer): ITracker {
  return new Tracker(idPrefix, context)
}