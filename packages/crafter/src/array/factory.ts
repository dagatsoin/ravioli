/* import { IType } from '../lib/IType'
import { ArrayType } from './type'
import { INodeType } from '../lib/INodeType'

export function array<F extends IType<any>>(
  itemType: F
): INodeType<
  NonNullable<ReturnType<F['create']>>[],
  NonNullable<Parameters<F['create']>[0]>[]
> {
  return new ArrayType(itemType)
}
 */