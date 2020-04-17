import { setNonEnumerable } from '../utils/utils'
import { ILeafType } from './ILeafType'
import { Instance, isInstance } from './Instance'
import { InputValidator } from './TypeChecker'
import { TypeFlag } from './TypeFlag'
import { IContainer } from '../IContainer'
import { ILeafInstance } from './ILeafInstance'

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
    this.$type = type
    this.$$id = options?.id || this.$$container.getUID('LeafInstance#')

    Object.keys(this).forEach(key => setNonEnumerable(this, key))

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
      this.$setValue = failMutation
    } else if (isCheckingEnabled) {
      this.$setValue = setWitchCheck(this, type.isValidSnapshot, type.typeFlag)
    } else {
      this.$setValue = setWithNoCheck(this)
    }
    setNonEnumerable(this, '$setValue')
  }
  public get $snapshot(): T {
    return this.$data
  }
  public get $value(): T {
    this.$$container.notifyRead(this)
    return this.$data
  }
  public get $id(): string {
    return this.$$id
  }
  // Implementation will be chosen by the constructor
  public $setValue(_: T): void {}
}

function setWitchCheck(
  instance: LeafInstance<any>,
  check: InputValidator,
  type: TypeFlag
) {
  return function(value: any): void {
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
  return function(value: any): void {
    instance.$data = isInstance(value)
      ? value.$data
      : value
  }
}

function failMutation(): void {
  throw new Error('Attempt to mutate an immutable value')
}
