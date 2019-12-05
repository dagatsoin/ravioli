import { IType } from './IType'

export interface INodeType<TYPE, SNAPSHOT> extends IType<TYPE, SNAPSHOT> {
  isNode: true
}
