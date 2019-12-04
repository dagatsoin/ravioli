import { IType } from './IType'

export type LeafValueType = string | number | boolean | unknown | undefined

export enum Primitive {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  timestamp = 'timestamp',
  undefined = 'undefined',
  unknown = 'unknown',
}
export interface ILeafType<T extends LeafValueType> extends IType<T> {
  isLeaf: true
  type: Primitive
}
