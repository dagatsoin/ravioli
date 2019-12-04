import { IType } from './IType'

export abstract class Type<T> implements IType<T> {
  get Type(): T {
    throw new Error(
      'Factory.Type should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.Type'
    )
  }
  public abstract isValidValue(value: any): value is T
  public abstract create(value?: any): T
}
