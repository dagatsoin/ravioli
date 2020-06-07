/* import {
  fail,
  getChildKey,
  toInstance,
  toNode,
  isChildPath,
  isNodePath,
  getSnapshot,
  isOwnLeafPath,
  unbox,
  getRoot,
  makePath,
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
  AddChanges,
} from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import {
  AddCommand,
  BasicCommand,
  ClearCommand,
  CopyCommand,
  isBasicCommand,
  MapCommand,
  MoveCommand,
  Command,
  RemoveCommand,
  ReplaceCommand,
  isShapeMutationCommand,
  Migration,
} from '../lib/JSONPatch'
import {
  createAddMigration,
  createCopyMigration,
  createMoveMigration,
  createRemoveMigration,
  createReplaceMigration as createReplaceMigration,
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { isNode } from "../lib/isNode"
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable, mergeMigrations } from '../utils/utils'

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

export class MapInstance<TYPE>
  extends NodeInstance<Map<string, TYPE>, Map<string, TYPE> | [string, TYPE][]>
  implements Map<string, TYPE> {
  public get size(): number {
    this.addObservedLength()
    return this.$data.size
  }
  public get [Symbol.toStringTag](): string {
    return this.$data[Symbol.toStringTag]
  }
  public $type: MapType<TYPE>
  public $data: DataMap<TYPE>
  
  constructor(
    type: MapType<TYPE>,
    entries?: [string, TYPE | Snapshot<TYPE>][] | Map<string, TYPE | Snapshot<TYPE>>,
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

  public toJSON(): [string, TYPE][] {
    return this.$snapshot as [string, TYPE][]
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
    values: Map<string, TYPE> | [string, TYPE][] | MapInstance<TYPE>
  ): void {
    if (!this.$$container.isWrittable) {
      throw new Error(
        'Crafter Map. Tried to set a Map value while model is locked.'
      )
    }

    this.$data.clear()
    if (Array.isArray(values)) {
      ;(values as [string, TYPE][]).forEach(entry => {
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
     (this.$type as MapType<any>).itemType.create(
      isInstance(item) ? getSnapshot(item) : item,
      { context: this.$$container }
    )
  

  public $present<O extends Command>(
    proposal: O & BasicCommand,
    willEmitPatch: boolean = false
  ): void {
    // Apply only if the path concerns this node or a leaf child.
    if (isNodePath(this.$path, proposal.path)) {
      present(this, [proposal], false)
    } else if (isOwnLeafPath(this.$path, proposal.path)) {
      if (isBasicCommand(proposal)) {
        present(this, [proposal])
      } else {
        throw new Error('LeafInstance accepts only basic JSON write commands')
      }
    } // Or delegate to children
    else if (isChildPath(this.$path, proposal.path)) {
      const childInstance = this.$data[
        Number(getChildKey(this.$path, proposal.path))
      ]
      // Get the concerned child key
      toNode(toInstance(childInstance)).$present(
        proposal as BasicCommand,
        willEmitPatch
      )
    }
  }

  public delete = (key: string): boolean => {
    try {
      present(this, [{ op: 'remove', path: this.$path + '/' + key }])
    } catch (e) {
      return false
    }
    return true
  }
  public forEach = (
    callbackfn: (value: TYPE, key: string, map: Map<string, TYPE>) => void,
    thisArg?: any
  ): void => {
    this.addObservedLength()
    Map.prototype.forEach.call(thisArg || this.$data, callbackfn)
  }
  public get = (key: string): TYPE | undefined => {
    const instance = this.$data.get(key) // case where JSON path is serialized
    if (instance) {
      // Notify the read of the child node
      if (isNode(instance)) {
        this.$$container.notifyRead(instance, makePath(getRoot(this).$id, instance.$path))
      }
      // return the instance if it is a node or the value if it is a leaf
      return unbox(instance)
    }
  }
  public has = (key: string): boolean => {
    this.$$container.notifyRead(this, makePath(getRoot(this).$id, this.$path, key))
    return this.$data.has(key)
  }
  public set = (key: string, value: TYPE | IInstance<TYPE>): this => {
    present(this, [
      {
        op: this.has(key) ? 'replace' : 'add',
        value,
        path: makePath(this.$path, key),
      },
    ])
    this.refineTypeIfNeeded(value)
    return this
  }
  public [Symbol.iterator](): IterableIterator<[string, TYPE]> {
    this.addObservedLength()
    return (this.$data[Symbol.iterator]() as unknown) as IterableIterator<
      [string, TYPE]
    >
  }
  public entries(): IterableIterator<[string, TYPE]> {
    this.addObservedLength()
    const newMap = new Map<string, TYPE>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value))
    })
    return newMap.entries()
  }
  public keys(): IterableIterator<string> {
    this.addObservedLength()
    return this.$data.keys()
  }
  public values(): IterableIterator<TYPE> {
    this.addObservedLength()
    const newMap = new Map<string, TYPE>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value))
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
    this.$$container.notifyRead(this, makePath(getRoot(this).$id, this.$path, 'size'))
  }
  private $attachChildren = (): void => {
    this.$data.forEach((instance, k) => {
      if (isNode(instance)) {
        instance.$attach(this, k)
      }
    })
  }
}

function generateSnapshot<T>(data: DataMap<T>): [string, T][] {
  const value: [string, T][] = []
  data.forEach((item, key) => {
    value.push([key, item.$snapshot])
  })
  return value
}

function generateValue<T>(data: DataMap<T>): Map<string, T> {
  const value: Map<string, T> = new Map()
  data.forEach((item, key) => {
    value.set(key, item.$value)
  })
  return value
}

function build(
  map: MapInstance<any>,
  entries: [any, any][] | Map<any, any> | MapInstance<any> = []
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

type Proposal<T = any> = MapCommand<T>

/**
 * Accept the value if the model is writtable
 *//*
function present<T>(
  model: MapInstance<T>,
  proposal: Proposal[],
  willEmitPatch: boolean = true
): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!model.$$container.isWrittable) {
    throw new Error(`Crafter Map. Tried to mutate a Map while model is locked.`)
  }

  const proposalMigration: Migration<any, any> = {
    forward: [],
    backward: []
  }

  proposal.forEach(command => {
    if (command.op === 'add') {
      const changes = add(model, command)
      if (changes) {
        model.refineTypeIfNeeded(command.value)
        mergeMigrations(createAddMigration(command), proposalMigration)
      }
    } else if (command.op === 'replace') {
      const changes = replace(model, command)
      if (changes) {
        mergeMigrations(createReplaceMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'remove') {
      const changes = deleteInMap(model, command)
      if (changes) {
        mergeMigrations(createRemoveMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      if (changes) {
        mergeMigrations(createCopyMigration(command, changes), proposalMigration)
      } else {
        const from = model.get(command.from)
        if (from === undefined) {
          fail("[CRAFTER: Map.copy from index is not valid. " + command)
        }
        mergeMigrations(
          createAddMigration({
            op: 'add',
            path: command.path,
            value: getSnapshot(toInstance(from)),
          }),
          proposalMigration
        )
      }
    } else if (command.op === 'move') {
      const changes = move(model, command)
      if (changes) {
        mergeMigrations(createMoveMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'clear') {
      if (model.$data.size > 0) {
        const changes = clear(model)
        if (changes) {
          mergeMigrations(createClearMigration(command, changes), proposalMigration)
        }
      }
    } else {
      throw new Error(`Crafter Array.$applyOperation: ${
        (proposal as any).op
      } is not a supported command. This error happened
        during a migration command. The transaction is cancelled and the model is reset to its previous value.`)
    }
  })

  // Those commands update the size of the map
  if (proposalMigration.forward.some(isShapeMutationCommand)) {
    model.$$container.addUpdatedObservable(model)
  }
  if (willEmitPatch) {
    model.$addMigration(proposalMigration)
  }
}

function add(
  model: MapInstance<any>,
  command: AddCommand | ReplaceCommand
): AddChanges | undefined {
  const key = getChildKey(model.$path, command.path)
  if (!key) {
    fail(`[CRAFTER] MapInstance.add command. Path is not valid: ${command.path}`)
    return
  }
  const item = toInstance(model.$type.itemType.create(command.value, { context: model.$$container }))
  model.$data.set(key, item)
  item.$attach(model, key)
  return {
    added: command.value,
  }
}

function replace(
  model: MapInstance<any>,
  command: AddCommand | ReplaceCommand
): ReplaceChanges | undefined {
  const key = getChildKey(model.$path, command.path)
  if (!key) {
    fail(`[CRAFTER] MapInstance.replace command. Path is not valid: ${command.path}`)
    return
  }
  const itemToReplace = model.get(key)
  itemToReplace.$kill()
  const changes = {
    replaced: getSnapshot(itemToReplace),
  }
  const target = model.get(key)
  if (target === undefined) {
    fail("[CRAFTER: Map.replace target index is not valid. " + command)
    return
  }
  target.$setValue(command.value)
  return changes
}

function deleteInMap(
  model: MapInstance<any>,
  command: RemoveCommand
): RemoveChanges | undefined {
  const key = getChildKey(model.$path, command.path)
  if (!key) {
    fail(`[CRAFTER] MapInstance.delete command. Path is not valid: ${command.path}`)
    return
  }
  const itemToRemove = model.get(key)
  itemToRemove.$kill()

  const changes = {
    removed: getSnapshot(itemToRemove),
  }
  const result = model.$data.delete(key)
  if (!result) {
    fail('Crafter Map. Can not delete ' + key)
    return
  }
  return changes
}

function copy(
  model: MapInstance<any>,
  command: CopyCommand
): CopyChanges | undefined {
  const fromKey = getChildKey(model.$path, command.from)
  const destinationKey = getChildKey(model.$path, command.path)
  if (!fromKey || !destinationKey) {
    fail(`[CRAFTER] MapInstance.copy command. Path is not valid: ${command.from}, ${command.path}`)
    return
  }
  const from = model.get(fromKey)
  const to = model.get(destinationKey)

  if (from === undefined) {
    fail('[CRAFTER] Map: copy command. ' + fromKey + ' does not exist')
    return
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
  model: MapInstance<any>,
  command: MoveCommand
): MoveChanges | undefined {
  const from = getChildKey(model.$path, command.from)
  const to = getChildKey(model.$path, command.path)
  if (!from || !to) {
    fail(`[CRAFTER] MapInstance.move command. Path is not valid: ${command.from}, ${command.path}`)
    return
  }
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

function clear(model: MapInstance<any>): ClearChanges<any> {
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

function createClearMigration(
  command: ClearCommand,
  changes: ClearChanges<any>
): Migration<ClearCommand, ReplaceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: 'replace',
        path: command.path,
        value: changes.removed,
      },
    ],
  }
} */