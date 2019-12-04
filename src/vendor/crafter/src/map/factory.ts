import { IType } from '../lib/IType'
import { MapType } from './type'

export function map<K, T>(itemType: IType<T>): MapType<K, T> {
  return new MapType(itemType)
}
