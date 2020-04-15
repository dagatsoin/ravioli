import { IObservable } from '../IObservable'
import { Migration } from './JSONPatch'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath } from '../helpers'

export interface ITracker {
  reportObserved(): void
  reportChanged(): void
}

export class Tracker implements IObservable, ITracker {
  public $isObservable: true = true
  public $patch: Migration<any, any> = {
    forward: [],
    backward: [],
  }

  private context: IContainer
  private id: string
  public get $id(): string {
    return this.id
  }

  constructor(idPrefix: string = 'Tracker', context?: IContainer) {
    this.context = context || getGlobal().$$crafterContext
    this.id = this.context.getUID(idPrefix + '#')
    this.context.useUID(this.id)
  }

  public $transactionDidEnd(): void {}

  public reportObserved(): void {
    this.context.addObservedPath(makePath(this.id))
  }

  public reportChanged(): void {
    this.context.transaction(() => this.context.addUpdatedObservable(this))
  }
}

export function createTracker(idPrefix: string = '', context?: IContainer): ITracker {
  return new Tracker(idPrefix, context)
}