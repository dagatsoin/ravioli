import { IInstance } from './IInstance'
import { IType } from './IType'

export abstract class Instance<T, D, S = T> implements IInstance<T, S> {
  abstract get $value(): T
  public $isInstance: true = true
  public abstract $snapshot: S
  public abstract $data: any
  public abstract $type: IType<T>
  public $applySnapshot(snapshot: S): void {
    if (this.$type.isValidValue(snapshot)) {
      this.$setValue(snapshot)
    }
  }
  public abstract $setValue(value: T): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}
