import { INodeType, IType } from '../lib'
import { MapType } from './type'

export function map<F extends IType<any>>(
  itemType: F
): INodeType<
  Map<string, ReturnType<F['create']>>,
  | Map<string, Parameters<F['create']>[0]>
  | [string, Parameters<F['create']>[0]][]
> {
  return new MapType(itemType)
}
