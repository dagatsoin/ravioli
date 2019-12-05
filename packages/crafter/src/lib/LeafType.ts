import { ILeafType, LeafValueType } from './ILeafType'
import { LeafInstance, Options } from './LeafInstance'
import { Type } from './Type'
import { InputValidator } from './TypeChecker'
import { TypeFlag } from './TypeFlag'
import { IContainer } from '../IContainer'

export class LeafType<T extends LeafValueType> extends Type<T, T>
  implements ILeafType<T> {
  public Type: T
  public isLeaf: true = true
  public typeFlag: TypeFlag
  public isValidSnapshot: InputValidator<T>
  private defaultValue?: T
  private options?: Options
  constructor({
    defaultValue,
    typeFlag,
    snapshotChecker,
    options,
  }: {
    defaultValue?: T
    typeFlag: TypeFlag
    snapshotChecker: InputValidator<T>
    options?: Options
  }) {
    super()
    this.typeFlag = typeFlag
    this.defaultValue = defaultValue
    this.isValidSnapshot = snapshotChecker
    this.options = options
  }
  public create(value?: T, options?: {id?: string, context?: IContainer}): any {
    const v = value !== undefined ? value : this.defaultValue
    const id = options?.id === '' ? undefined : options?.id
    return new LeafInstance({
      type: this,
      value: v,
      options: {
        id,
        context: options?.context,
        ...this.options
      }
    })
  }

  public isValidValue(value: any): value is T {
    return this.isValidSnapshot(value)
  }
}

export function isLeafType<T extends LeafValueType>(
  thing: any
): thing is ILeafType<T> {
  return (thing as ILeafType<any>).isLeaf
}
