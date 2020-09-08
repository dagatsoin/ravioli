import { mergeMigrations } from '../utils/utils'
import { ILeafType } from './ILeafType'
import { Instance, isInstance } from './Instance'
import { InputValidator } from './TypeChecker'
import { TypeFlag } from './TypeFlag'
import { IContainer } from '../IContainer'
import { ILeafInstance } from './ILeafInstance'
import { makePath, getRoot } from '../helpers'
import { createReplaceMigration } from './mutators'
import { ReplaceCommand } from './JSONPatch'

export type Options = {
  id?: string,
  context?: IContainer
  isImmutable?: boolean
  isCheckingEnabled?: boolean
}

export class LeafInstance<T> extends Instance<T, T> implements ILeafInstance<T> {
  public $data: T
  public $isLeaf: true = true
  public $type: ILeafType<T>

  private setter: (v: T) => void

  constructor({
    type,
    value,
    options,
  }: {
    type: ILeafType<T>
    value: T
    options?: Options
  }) {
    super(
      (data) => data,
      options?.context
    )
    this.$data = value
    this.$isStale = false
    this.$type = type
    this.$$id = options?.id || this.$$container.getUID('LeafInstance#')

    // Rather having unused condition in the setter, the constructor
    // will choose how to implement the setter.
    const isImmutable = options?.isImmutable || false
    const isCheckingEnabled = options?.isCheckingEnabled || false

    if (isImmutable) {
      if (isCheckingEnabled) {
        if (this.$type.isValidSnapshot(value)) {
          this.$data = value
        } else {
          throw new Error(
            `Crafter LeafInstance. Exepted a ${type} got ${typeof value}`
          )
        }
      }
      this.setter = failMutation
    } else if (isCheckingEnabled) {
      this.setter = setWitchCheck(this, type.isValidSnapshot, type.typeFlag)
    } else {
      this.setter = setWithNoCheck(this)
    }
    this.$computeSnapshot()
  }

  public get $value(): T {
    this.$notifyRead()
    return this.$data
  }

  public get $id(): string {
    return this.$$id
  }

  public $present (proposal: ReplaceCommand[], addMigration = true): void {
    // As a leaf instance only supports replace command, we just treat the last command
    const command = proposal[proposal.length-1]
    const didChange = this.setValue(command.value)
    this.updateState(command, didChange, addMigration)
  }

  public setValue(value: T): boolean {
    const backup = this.$snapshot
    this.setter(value)
    return backup !== this.$data
  }

  private updateState(command: ReplaceCommand, didChange: boolean, addMigration: boolean){
    this.$state = {
      didChange,
      migration: didChange ? createReplaceMigration(command, {replaced: this.$snapshot}) : {forward: [], backward: []}
    }  

    // The data has changed, this instance is now stale
    const isStale = didChange
    this.next(isStale, addMigration)
  }

  private next(isStale: boolean, addMigration: boolean) {
    if (isStale) {
      this.$$container.addUpdatedObservable(this)
      this.$invalidateSnapshot();
      if (addMigration) {
        this.$$container.addMigration(this.$state.migration, getRoot(this).$id)
      }
    }
  }
}

function setWitchCheck(
  instance: LeafInstance<any>,
  check: InputValidator,
  type: TypeFlag
) {
  return function(value: any) {
    if (check(value)) {
      instance.$data = value
    } else {
      throw new Error(
        `Crafter LeafInstance. Exepted a ${type} got ${typeof value}`
      )
    }
  }
}

function setWithNoCheck(instance: LeafInstance<any>) {
  return function(value: any) {
    instance.$data = isInstance(value)
      ? value.$value
      : value
  }
}

function failMutation(): any {
  throw new Error('Attempt to mutate an immutable value')
}
