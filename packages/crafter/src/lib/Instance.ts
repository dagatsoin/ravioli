import { IInstance } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'

export abstract class Instance<T, Input = T> implements IInstance<T, Input> {
  
  abstract get $value(): T
  abstract get $id(): string
  
  public $isInstance: true = true
  public $$container: IContainer
  protected $$id!: string

  public abstract $snapshot: Input
  public abstract $data: any
  public abstract $type: IType<T, Input>

  constructor(context?: IContainer) {
    this.$$container = context || getGlobal().$$crafterContext
  }

  public $kill(): void {
    this.$$container.removeUID(this.$$id)
  }

  public $applySnapshot(snapshot: Input): void {
    if (this.$type.isValidSnapshot(snapshot)) {
      this.$setValue(snapshot)
    }
  }
  public abstract $setValue(value: Input): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}
