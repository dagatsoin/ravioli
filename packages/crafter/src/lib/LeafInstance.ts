import { mergeMigrations } from '../utils/utils'
import { ILeafType } from './ILeafType'
import { Instance, isInstance } from './Instance'
import { InputValidator } from './TypeChecker'
import { TypeFlag } from './TypeFlag'
import { IContainer } from '../IContainer'
import { ILeafInstance } from './ILeafInstance'
import { makePath, getRoot } from '../helpers'
import { createReplaceMigration } from './mutators'
import { ReplaceCommand, Operation } from './JSONPatch'

export type Options = {
  id?: string,
  context?: IContainer
  isImmutable?: boolean
  isCheckingEnabled?: boolean
}

export class LeafInstance<T> extends Instance<T, T> implements ILeafInstance<T> {
  public $data: any
  public $isLeaf: true = true
  public $type: ILeafType<T>

  private setter: (v: T) => void
  private $prevSnapshot: T

  constructor({
    type,
    value,
    options,
  }: {
    type: ILeafType<T>
    value: T
    options?: Options
  }) {
    super(options?.context)
    this.$data = value
    this.$prevSnapshot = value
    this.$hasStaleSnapshot = false
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
  }

  public get $snapshot(): T {
    if (this.$hasStaleSnapshot) {
      this.$data
    }
    return this.$prevSnapshot
  }

  public get $value(): T {
    this.$$container.notifyRead(this, makePath(getRoot(this).$id, this.$path))
    return this.$data
  }
  public get $id(): string {
    return this.$$id
  }

  public $present (patchProposal: ReplaceCommand[], addMigration = true): void {
    const acceptedCommands = []
    for (const command of patchProposal) {
      if (command.op === Operation.replace){
        const didChange = this.$setValue(command.value)
        if (didChange) {
          acceptedCommands.push(command)
        }
      }
    }
    this.next(acceptedCommands, addMigration)
  }

  public $setValue(value: T): boolean {
    const backup = this.$snapshot
    this.setter(value)
    return backup !== this.$data
  }

  private next (acceptedCommands: ReplaceCommand[], addMigration: boolean){
    this.$$container.addUpdatedObservable(this)
    if (addMigration) {
      const proposalMigration = {
        forward: [],
        backward: []
      }
      acceptedCommands.forEach(command => mergeMigrations(createReplaceMigration(command, {replaced: this.$snapshot}), proposalMigration))
      this.$$container.addMigration(proposalMigration)
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
      ? value.$data
      : value
    instance.$$container.addUpdatedObservable(instance)
  }
}

function failMutation(): any {
  throw new Error('Attempt to mutate an immutable value')
}
