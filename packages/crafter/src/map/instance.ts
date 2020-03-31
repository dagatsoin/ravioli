import {
  getChildKey,
  toInstance,
  toNode,
  isChildPath,
  isNodePath,
  getSnapshot,
  isOwnLeafPath,
  unbox,
  getRoot,
} from '../helpers'
import { computeNextState } from '../lib/computeNextState'
import { IInstance } from '../lib/IInstance'
import {
  CopyChanges,
  DataMap,
  INodeInstance,
  MoveChanges,
  RemoveChanges,
  ReplaceChanges,
} from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import {
  AddOperation,
  BasicOperation,
  ClearOperation,
  CopyOperation,
  isBasicJSONOperation,
  MapOperation,
  MoveOperation,
  Operation,
  RemoveOperation,
  ReplaceOperation,
} from '../lib/JSONPatch'
import {
  addAddPatch,
  addCopyPatch,
  addMovePatch,
  addRemovePatch,
  addReplacePatch,
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { isNode } from "../lib/isNode"
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../utils/utils'

import { MapType } from './type'
import { IContainer } from '../IContainer'
import { isUnknownType } from '../Primitive'
import { getTypeFromValue } from "../lib/getTypeFromValue"

const methodKeys = [
  'keys',
  'values',
  'entries',
  'set',
  'get',
  'delete',
  'clear',
  'forEach',
  'size',
]

export class MapInstance<K, TYPE>
  extends NodeInstance<Map<K, TYPE>, Map<any, TYPE> | [any, TYPE][]>
  implements Map<K, TYPE> {
  public get size(): number {
    this.addObservedLength()
    return this.$data.size
  }
  public get [Symbol.toStringTag](): string {
    return this.$data[Symbol.toStringTag]
  }
  public $type: MapType<K, TYPE>
  public $data: DataMap<K, TYPE>
  
  constructor(
    type: MapType<K, TYPE>,
    entries?: [K, TYPE | Snapshot<TYPE>][] | Map<K, TYPE | Snapshot<TYPE>>,
    options?: {
      id?: string,
      context?: IContainer
    }
  ) {
    // Initialize the array
    super(generateSnapshot, generateValue, methodKeys, options)
    this.$type = type
    this.$data = new Map()
    build(this, entries)
    // Make all class properties non enumerable
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    this.$computeSnapshot()
  }

  public toJSON(): [any, TYPE][] {
    return this.$snapshot as [any, TYPE][]
  }
  public $getMethodKeys(): string[] {
    throw new Error('Method not implemented.')
  }

  public $attach(parent: INodeInstance<any>, key: string | number): void {
    this.$parent = parent
    this.$parentKey = key
    this.$attachChildren()
  }

  public $kill(): void {
    super.$kill()
    // Kill children ><'
    this.$data.forEach(child => {
      child.$kill()
    })
  }

  public $setValue(
    values: Map<K, TYPE> | [K, TYPE][] | MapInstance<K, TYPE>
  ): void {
    if (!this.$$container.isWrittable) {
      throw new Error(
        'Crafter Map. Tried to set a Map value while model is locked.'
      )
    }

    this.$data.clear()
    if (Array.isArray(values)) {
      ;(values as [K, TYPE][]).forEach(entry => {
        const [key, value] = entry
        this.$data.set(key, this.$createChildInstance(value))
      })
    } else {
      values.forEach((value, key) => {
        this.$data.set(key, this.$createChildInstance(value))
      })
    }
    this.$attachChildren()
    computeNextState(this)
  }
  public clear = (): void => {
    present(this, [{ op: 'clear', path: this.$path }])
  }
  public $addInterceptor(_index: string | number): void {
    // use Map.get/set
    throw new Error('Method not implemented.')
  }

  public $createChildInstance = <I = TYPE>(item: I): I & IInstance<I> => 
    // @todo: remove when ref will be implemented
     (this.$type as MapType<any, any>).itemType.create(
      isInstance(item) ? getSnapshot(item) : item,
      { context: this.$$container }
    )
  

  public $applyOperation<O extends Operation>(
    proposal: O & BasicOperation,
    willEmitPatch: boolean = false
  ): void {
    // Apply only if the path concerns this node or a leaf child.
    if (isNodePath(this.$path, proposal.path)) {
      present(this, [proposal], false)
    } else if (isOwnLeafPath(this.$path, proposal.path)) {
      if (isBasicJSONOperation(proposal)) {
        present(this, [proposal])
      } else {
        throw new Error('LeafInstance accepts only basic JSON write operations')
      }
    } // Or delegate to children
    else if (isChildPath(this.$path, proposal.path)) {
      const childInstance = this.$data[
        Number(getChildKey(this.$path, proposal.path))
      ]
      // Get the concerned child key
      toNode(toInstance(childInstance)).$applyOperation(
        proposal as BasicOperation,
        willEmitPatch
      )
    }
  }

  public delete = (key: K): boolean => {
    try {
      present(this, [{ op: 'remove', path: this.$path + '/' + key }])
    } catch (e) {
      return false
    }
    return true
  }
  public forEach = (
    callbackfn: (value: TYPE, key: K, map: Map<K, TYPE>) => void,
    thisArg?: any
  ): void => {
    this.addObservedLength()
    Map.prototype.forEach.call(thisArg || this.$data, callbackfn)
  }
  public get = (key: K): TYPE | undefined => {
    this.$$container.addObservedPath(getRoot(this).$id + this.$path + '/' + key)
    const instance = this.$data.get(key)
    return instance ? unbox(instance, this.$$container) : undefined
  }
  public has = (key: K): boolean => {
    this.$$container.addObservedPath(getRoot(this).$id + this.$path + '/' + key)
    return this.$data.has(key)
  }
  public set = (key: K, value: TYPE | IInstance<TYPE>): this => {
    present(this, [
      {
        op: this.has(key) ? 'replace' : 'add',
        value,
        path: this.$path + '/' + key,
      },
    ])
    this.refineTypeIfNeeded(value)
    return this
  }
  public [Symbol.iterator](): IterableIterator<[K, TYPE]> {
    this.addObservedLength()
    return (this.$data[Symbol.iterator]() as unknown) as IterableIterator<
      [K, TYPE]
    >
  }
  public entries(): IterableIterator<[K, TYPE]> {
    this.addObservedLength()
    const newMap = new Map<K, TYPE>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value, this.$$container))
    })
    return newMap.entries()
  }
  public keys(): IterableIterator<K> {
    this.addObservedLength()
    return this.$data.keys()
  }
  public values(): IterableIterator<TYPE> {
    this.addObservedLength()
    const newMap = new Map<K, TYPE>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value, this.$$container))
    })
    return newMap.values()
  }
  public refineTypeIfNeeded(value: TYPE | IInstance<TYPE>) {
    if (isUnknownType(this.$type.itemType)) {
      this.$type.itemType = isInstance(value)
        ? value.$type
        : getTypeFromValue(value as any)
    }
  }
  private addObservedLength = (): void => {
    this.$$container.addObservedPath(getRoot(this).$id + this.$path + '/size')
  }
  private $attachChildren = (): void => {
    this.$data.forEach((instance, k) => {
      if (isNode(instance)) {
        instance.$attach(this, toKey(k))
      }
    })
  }
}

function generateSnapshot<T>(data: DataMap<any, T>): [any, T][] {
  const value: [any, T][] = []
  data.forEach((item, key) => {
    value.push([key, item.$snapshot])
  })
  return value
}

function generateValue<T>(data: DataMap<any, T>): Map<any, T> {
  const value: Map<any, T> = new Map()
  data.forEach((item, key) => {
    value.set(key, item.$value)
  })
  return value
}

function build(
  map: MapInstance<any, any>,
  entries: [any, any][] | Map<any, any> | MapInstance<any, any> = []
): void {
  map.$$container.transaction(() => {
    if (entries instanceof Map) {
      entries.forEach((item, key) => {
        map.set(key, item)
      })
    } else {
      const _entries = isInstance(entries) ? entries.$snapshot : entries
      _entries.forEach((entry: [any, any]) => {
        map.set(entry[0], entry[1])
      })
    }
  })
}

/**
 * Convenience function to convert any type into a string
 */
function toKey(k: any): string {
  return typeof k === 'object' || Array.isArray(k) ? JSON.stringify(k) : k
}

type Proposal<T = any> = MapOperation<T>

/**
 * Accept the value if the model is writtable
 */
function present<T>(
  model: MapInstance<any, T>,
  proposal: Proposal[],
  willEmitPatch: boolean = true
): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!model.$$container.isWrittable) {
    throw new Error(`Crafter Map. Tried to mutate a Map while model is locked.`)
  }
  proposal.forEach(command => {
    if (command.op === 'add') {
      add(model, command)
      model.refineTypeIfNeeded(command.value)
      if (willEmitPatch) {
        addAddPatch(model, command)
      }
    } else if (command.op === 'replace') {
      const changes = replace(model, command)
      if (willEmitPatch) {
        addReplacePatch(model, command, changes)
      }
    } else if (command.op === 'remove') {
      const changes = deleteInMap(model, command)
      if (willEmitPatch) {
        addRemovePatch(model, command, changes)
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      if (willEmitPatch) {
        if (changes) {
          addCopyPatch(model, command, changes)
        } else {
          const from = model.get(command.from)
          if (from === undefined) {
            throw new Error("[CRAFTER: Map.copy from index is not valid. " + command)
          }
          addAddPatch(model, {
            op: 'add',
            path: command.path,
            value: getSnapshot(toInstance(from)),
          })
        }
      }
    } else if (command.op === 'move') {
      const changes = move(model, command)
      if (willEmitPatch) {
        addMovePatch(model, command, changes)
      }
    } else if (command.op === 'clear') {
      const changes = clear(model)
      if (willEmitPatch) {
        addClearPatch(model, command, changes)
      }
    } else {
      throw new Error(`Crafter Array.$applyOperation: ${
        (proposal as any).op
      } is not a supported operation. This error happened
        during a patch operation. The transaction is cancelled and the model is reset to its previous value.`)
    }
  })

  computeNextState(model)
}

function add(
  model: MapInstance<any, any>,
  command: AddOperation | ReplaceOperation
): void {
  const key = getKey(model, command)
  const item = toInstance(model.$type.itemType.create(command.value, { context: model.$$container }))

  model.$data.set(key, item)

  if (isNode(item)) {
    item.$attach(model, key)
  }
}

function replace(
  model: MapInstance<any, any>,
  command: AddOperation | ReplaceOperation
): ReplaceChanges {
  const key = getKey(model, command)
  const itemToReplace = model.get(key)
  itemToReplace.$kill()
  const changes = {
    replaced: getSnapshot(itemToReplace),
  }
  const target = model.$data.get(key)
  if (target === undefined) {
    throw new Error("[CRAFTER: Map.replace target index is not valid. " + command)
  }
  target.$setValue(command.value)
  return changes
}

function deleteInMap(
  model: MapInstance<any, any>,
  command: RemoveOperation
): RemoveChanges {
  const key = getKey(model, command)
  const itemToRemove = model.get(key)
  itemToRemove.$kill()

  const changes = {
    removed: getSnapshot(itemToRemove),
  }
  const result = model.$data.delete(key)
  if (!result) {
    throw new Error('Crafter Map. Can not delete ' + key)
  }
  return changes
}

function copy(
  model: MapInstance<any, any>,
  command: CopyOperation
): CopyChanges | undefined {
  const fromKey = getChildKey(model.$path, command.from)
  const destinationKey = getKey(model, command)
  const from = model.$data.get(fromKey)
  const to = model.$data.get(destinationKey)

  if (from === undefined) {
    throw new Error(
      'Crafter Map: copy operation. ' + fromKey + ' does not exist'
    )
  }

  // Destination key exists, it is a replace
  if (to) {
    return replace(model, { op: 'replace', path: command.path, value: from })
  }
  // Destination key does not exists, it is a add
  else {
    add(model, { op: 'add', path: command.path, value: from })
  }
}

function move(
  model: MapInstance<any, any>,
  command: MoveOperation
): MoveChanges {
  const from = getChildKey(model.$path, command.from)
  const to = getKey(model, command)
  const movedItem = model.get(from)
  const changes = {
    moved: getSnapshot(movedItem),
    replaced: getSnapshot(model.get(to)),
  }

  // Copy value
  model.$data.set(to, movedItem)

  // Detach and delete item at origin index
  movedItem.$kill()
  model.delete(from)

  return changes
}

type ClearChanges<T> = {
  removed: [string, T][]
}

function clear(model: MapInstance<any, any>): ClearChanges<any> {
  const snapshot =
    model.$snapshot instanceof Map
      ? Array.from(model.$snapshot.entries())
      : model.$snapshot

  // Detach all items
  model.$data.forEach(item => {
    item.$kill()
  })

  // Clear
  model.$data.clear()

  return {
    removed: snapshot,
  }
}

function addClearPatch(
  model: MapInstance<any, any>,
  command: ClearOperation,
  changes: ClearChanges<any>
): void {
  model.$addPatch({
    forward: [command],
    backward: [
      {
        op: 'replace',
        path: model.$path,
        value: changes.removed,
      },
    ],
  })
}

function getKey(
  model: MapInstance<any, any>,
  proposal: Proposal
): string | number {
  const stringKey = getChildKey(model.$path, proposal.path)
  const key = isNaN(stringKey as any /* prevent unecessary Number conversion*/)
    ? stringKey
    : Number(stringKey)
  if (!isValidMapKey(model, key, proposal)) {
    throw new Error(`Crafter ${key} is not a valid Map key.`)
  }
  return key
}

/**
 * Return true if the string is a valid Object or Map index.
 */
function isValidMapKey(
  model: MapInstance<any, any>,
  index: string | number,
  proposal: Proposal<any>
): boolean {
  return (
    // other command than add must lead to an existing index
    proposal.op !== 'add'
      ? model.has(index) // check if the key exists, not if there is a value (undefined is a valid value)
      : true
  )
}
