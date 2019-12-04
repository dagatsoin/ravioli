import { IType } from './IType'

export type Props<T> = { [K in keyof T]: IType<T[K]> }

export interface INodeType<T> extends IType<T> {
  isNode: true
  // create(value?: T, id?: string): T; // Override to refine return type
}
