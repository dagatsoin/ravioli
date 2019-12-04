import { ILeafType, LeafValueType, Primitive } from './ILeafType'
import { LeafInstance } from './LeafInstance'
import { Type } from './Type'
import { TypeChecker } from './TypeChecker'

export class LeafType<T extends LeafValueType> extends Type<T>
  implements ILeafType<T> {
  public Type: T
  public isLeaf: true = true
  public type: Primitive
  public isValidValue: TypeChecker<T>
  private defaultValue: T
  constructor(
    defaultValue: T,
    typeFlag: Primitive,
    typeChecker: TypeChecker<T>
  ) {
    super()
    this.type = typeFlag
    this.defaultValue = defaultValue
    this.isValidValue = typeChecker
  }

  public create(value?: any): any {
    const v = this.isValidValue(value) ? value : this.defaultValue
    return new LeafInstance(this, v)
  }
}

export function isLeafType<T extends LeafValueType>(
  thing: any
): thing is ILeafType<T> {
  return (thing as ILeafType<any>).isLeaf
}
