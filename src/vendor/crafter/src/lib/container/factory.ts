import { IType } from '../IType'
import { ContainerType } from './type'

export function container<T extends IType<any>>(type: T): ContainerType<T> {
  return new ContainerType(type)
}
