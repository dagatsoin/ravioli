import { Operation as JSONOp } from 'fast-json-patch'

export interface CopyWithinOperation {
  op: 'copyWithin'
  path: string
  target: number
  start: number
  end: number
}

export interface SpliceOperation<T> {
  op: 'splice'
  path: string
  start: number
  deleteCount: number
  items: T[]
}

export interface ConcatOperation<T> {
  op: 'concat'
  path: string
  items: T[]
}

export type Operation =
  | JSONOp
  | CopyWithinOperation
  | SpliceOperation<any>
  | ConcatOperation<any>
