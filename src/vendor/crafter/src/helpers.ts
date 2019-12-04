import { IInstance } from './lib/IInstance'
import { INodeInstance } from './lib/INodeInstance'
import { isInstance } from './lib/Instance'
import { isNode } from './lib/NodeInstance'
import { getSnapshot } from './utils'

export function getNode<T>(data: T): INodeInstance<T> {
  if (!isNode<T>(data)) {
    throw new Error(
      `Invalid argument. Expecting a INode<T>. Got ${typeof data}`
    )
  }
  return data
}

export function getInstance<T>(data: T): IInstance<T> {
  if (!isInstance<T>(data)) {
    throw new Error(
      `Invalid argument. Expecting a IInstance<T>. Got ${typeof data}`
    )
  }
  return data
}

export function unbox<T>(instance: IInstance<T>): T {
  return isNode<T>(instance) ? ((instance as unknown) as T) : instance.$value
}

export function clone<T>(instance: T): T {
  const node = getNode(instance)
  if (isInstance(instance)) {
    return node.$type.create(getSnapshot(instance))
  }
  throw new Error("Trying to clone other than an IInstance")
}

export function assert(assertion: boolean, errorMsg?: string) {
  if (!assertion) {
    throw new Error(errorMsg)
  }
}

export function uniq<T>(_array: T[]): T[] {
  return _array.filter((testItem, index) => _array.indexOf(testItem) === index)
}
