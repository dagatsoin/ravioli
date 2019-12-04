import { IType } from '../lib/IType'
import { ArrayType } from './type'

export function array<T>(itemType: IType<T>): ArrayType<T> {
  return new ArrayType(itemType)
}
