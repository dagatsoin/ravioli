import { IType } from './IType'
import { IInstance } from './IInstance'
import { IContainer } from '../IContainer'

export abstract class Type<T, INPUT> implements IType<T, INPUT> {
  public get Type(): T {
    throw new Error(
      'Factory.Type should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.Type'
    )
  }
  public get Snapshot(): INPUT {
    throw new Error(
      'Factory.Type should not be actually called. It is just a Snaphsot signature that can be used at compile time with Typescript, by using `typeof type.Snapshot'
    )
  }
  public applySnapshot(instance: IInstance<T, INPUT>, snapshot: INPUT): void {
    instance.$$container.transaction(() => {
      instance.$applySnapshot(snapshot)
    })
  }

  public getSnapshot(instance: IInstance<T, INPUT>): INPUT {
    return instance.$snapshot
  }

  public abstract isValidSnapshot(value: any): value is INPUT
  public abstract isValidValue(value: any): value is INPUT
  public abstract create(value?: INPUT | undefined, options?: { id?: string, context?: IContainer }): T
}
