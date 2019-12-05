import { SortCommands } from '../array'
import { IObserver } from '../observer/Observer'

export interface AddOperation<T = any> extends Operation {
  op: 'add'
  value: T
}

export interface RemoveOperation extends Operation {
  op: 'remove'
}
export interface ReplaceOperation<T = any> extends Operation {
  op: 'replace'
  value: T
}
export interface MoveOperation extends Operation {
  op: 'move'
  from: string
}
export interface CopyOperation extends Operation {
  op: 'copy'
  from: string
}
export interface SpliceOperation<T = any> extends Operation {
  op: 'splice'
  value?: T[]
  start: number
  deleteCount?: number | undefined
}

export interface PushOperation<T = any> extends Operation {
  op: 'push'
  value: T[]
}

export interface UnshiftOperation<T = any> extends Operation {
  op: 'unshift'
  value: T[]
}

export interface SetLengthOperation extends Operation {
  op: 'setLength'
  value: number
}

export interface CopyWithinOperation extends Operation {
  op: 'copyWithin'
  target: number
  start: number
  end?: number
}

export interface FillOperation<T = any> extends Operation {
  op: 'fill'
  value: T
  start?: number
  end?: number
}

export interface ReverseOperation extends Operation {
  op: 'reverse'
}

export interface ShiftOperation extends Operation {
  op: 'shift'
}

export interface PopOperation extends Operation {
  op: 'pop'
}

export interface SortOperation extends Operation {
  op: 'sort'
  commands: SortCommands
}

export interface ClearOperation extends Operation {
  op: 'clear'
}

export type Operation = {
  op: string
  path: string
}

export type BasicOperation<T = any> =
  | AddOperation<T>
  | RemoveOperation
  | ReplaceOperation<T>
  | MoveOperation
  | CopyOperation

export type ArrayOperation<T = any> =
  | BasicOperation<T>
  | PushOperation<T>
  | SetLengthOperation
  | SpliceOperation<T>
  | CopyWithinOperation
  | FillOperation<T>
  | ReverseOperation
  | ShiftOperation
  | PopOperation
  | SortOperation
  | UnshiftOperation<T>

export type MapOperation<T = any> = BasicOperation<T> | ClearOperation

export type Migration<O extends Operation = any, R extends Operation = any> = {
  forward: O[]
  backward: R[]
}

export function isBasicJSONOperation<O extends Operation>(proposal: O): boolean {
  return (
    proposal.op === 'add' ||
    proposal.op === 'copy' ||
    proposal.op === 'move' ||
    proposal.op === 'replace' ||
    proposal.op === 'remove'
  )
}

export function isAdditiveOperationWithoutKey({op}: Operation): boolean {
  return (
    // Array
    op === 'push' ||
    op === 'unshift' ||
    op === 'splice' ||
    op === 'setLength' ||
    // Map
    op === 'set'
  )
}

export function isRemovalOperationWithoutKey({op}: Operation): boolean {
  return (
    // Array
    op === 'splice' ||
    op === 'shift' ||
    op === 'pop' ||
    op === 'setLength' ||
    // Map
    op === 'delete' ||
    op === 'clear'
  )
}


export function isDependent({op, path}: Operation) {
  return function (node: IObserver): boolean {
    return (
      // Path is part of the dependency
      hasPath(node, path) || 
      // The node depends on the length of a array
      // and the operation was a push, splice, ...
      hasPath(node, path + '/length') && isLenghtOperation({op, path}) ||
      // The node depends on the length of a map
      // and the operation was a set, delete, ...
      hasPath(node, path + '/size') && isLenghtOperation({op, path})
    )
  }
}

export function hasPath(node: IObserver, path: string): boolean {
  return node.dependencyPaths.some(depPath => depPath === path)
}

/**
 * Return true if the operation has an incidence on the lenght/size of the array/map
 */
function isLenghtOperation(operation: Operation): boolean {
  return isRemovalOperationWithoutKey(operation) || isAdditiveOperationWithoutKey(operation)
}
