import { IType } from './IType'
import { TypeFlag } from './TypeFlag'

export type LeafValueType = string | number | boolean | unknown | undefined

export interface ILeafType<T extends LeafValueType> extends IType<T> {
  isLeaf: true
  typeFlag: TypeFlag
}
