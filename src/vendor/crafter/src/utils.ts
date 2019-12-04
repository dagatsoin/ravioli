import { getInstance, getNode } from './helpers'
import { INodeInstance } from './lib/INodeInstance'
import { isNode } from './lib/NodeInstance'
import { Snapshot } from "./lib/Snapshot"
import * as STManager from './STManager'

export function getParent(node: INodeInstance<any>) {
  if (!isNode(node)) throw new Error(`Expecting a node, got: ${typeof node}`)
  return node.$parent
}

export function getValue<T>(instance: T): T {
  return isNode(instance) ? getNode(instance).$value : instance
}

export function applySnapshot<T>(node: T, snapshot: Snapshot<T>): void {
  STManager.transaction(() => {
    getNode(node).$applySnapshot(snapshot)
  })
}

export function getSnapshot<T>(instance: T): Snapshot<T> {
  return getInstance(instance).$snapshot
}

export function setValue<T>(instance: T, value: T): void {
  STManager.transaction(() => {
    getNode(instance).$setValue(value)
  })
}
