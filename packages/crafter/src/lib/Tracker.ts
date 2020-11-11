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
  public isTracker: true = true
  public $migration: Migration<any, any> = {
    forward: [],
    backward: [],
  }
  public $path: string
  private context: IContainer
  private id: string
  public get $id(): string {
    return this.id
  }

  constructor(idPrefix: string = 'Tracker', context?: IContainer) {
    this.context = context || getGlobal().$$crafterContext
    this.id = this.context.getUID(idPrefix + '#')
    this.$path = makePath(this.id)
    this.context.useUID(this.id)
  }

  public reportObserved(): void {
    this.context.notifyRead(makePath(this.id))
  }

  public reportChanged(): void {
    this.$migration.forward = [{op: 'replace', path: makePath(this.id), value: ''}]
    this.context.step(() => this.context.addUpdatedObservable(this))
  }
}

export function createTracker(idPrefix: string = '', context?: IContainer): ITracker {
  return new Tracker(idPrefix, context)
}