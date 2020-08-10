/* import { ArrayType } from '../array/type'
import {
  clone,
  fail,
  getChildKey,
  toInstance,
  toNode,
  getSnapshot,
  isChildPath,
  isInstancePath,
  isOwnLeafPath,
  unbox,
  getRoot,
  makePath,
} from '../helpers'
import { IInstance } from '../lib/IInstance'
import { DataArray, INodeInstance, RemoveChanges, ReplaceChanges } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import {
  ArrayCommand,
  CopyWithinCommand,
  FillCommand,
  isBasicCommand,
  Migration,
  PopCommand,
  PushCommand,
  RemoveCommand,
  ReverseCommand,
  SetLengthCommand,
  ShiftCommand,
  SpliceCommand,
  UnshiftCommand,
} from '../lib/JSONPatch'
import {
  add,
  createAddMigration,
  createCopyMigration,
  createMoveMigration,
  createRemoveMigration,
  createReplaceMigration,
  copy,
  move
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { isNode } from "../lib/isNode"
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable, mergeMigrations } from '../utils/utils'
import { IContainer } from '../IContainer'
import { isUnknownType, isPrimitive } from '../Primitive'
import { getTypeFromValue } from "../lib/getTypeFromValue"
import { ReferenceType, reference, isReferenceType } from '../lib/reference'
import { INodeType } from '../lib/INodeType'
import { isNodeType, isShapeMutationCommand, SortCommand, Operation } from '../lib'

// List all the Array method keys that should be bound into a container.
const methodKeys = [
  'length',
  'entries',
  'keys',
  'values',
  'copyWithin',
  'concat',
  'filter',
  'reduce',
  'reduceRight',
  'fill',
  'find',
  'findIndex',
  'indexOf',
  'lastIndexOf',
  'every',
  'join',
  'reverse',
  'shift',
  'some',
  'includes',
  'sort',
  'splice',
  'slice',
  'pop',
  'push',
  'unshift',
  'toString',
  'toLocaleString',
  'forEach',
  'map',
]

export class ArrayInstance<SUBTYPE, INPUT extends SUBTYPE[] = SUBTYPE[]>
  extends NodeInstance<SUBTYPE[]>
  implements Array<SUBTYPE> {
  [n: number]: SUBTYPE
  public get length(): number {
    addObservedLength(this)
    return this.$data.length
  }

  public set length(value: number) {
    present(this as any, [
      {
        op: Operation.setLength,
        path: this.$path,
        value,
      },
    ])
  }

  public $type: ArrayType<SUBTYPE>
  public $data: DataArray<SUBTYPE> = []
  public $refFactory: ReferenceType<INodeType<SUBTYPE, SUBTYPE>> | undefined = undefined
  public $isPrimitiveArray: 'unknown' | boolean = 'unknown'
  
  constructor(
    type: ArrayType<SUBTYPE>,
    items: SUBTYPE[] | Snapshot<SUBTYPE>[],
    options?: {
      id?: string,
      context?: IContainer
    }
  ) {
    // Initialize the array
    super(generateSnapshot, generateValue, methodKeys, options)
    this.$type = type
    // The item type is known. If not, those commands will be done in refineTypeIfNeeded
    if (!isUnknownType(type.itemType)) {
      this.$refFactory = (isNodeType(type.itemType) ? reference(type.itemType) : undefined) as any
      this.$isPrimitiveArray = !isNodeType(type.itemType)
    }
    // Make all class properties non enumerable
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    build(this, items)
    this.$computeSnapshot()
  }
  public flatMap<U, This = undefined>(
    _callback: (
      this: This,
      value: SUBTYPE,
      index: number,
      array: SUBTYPE[]
    ) => U | readonly U[], _thisArg?: This | undefined): U[] {
    throw new Error("Method not implemented.")
  }
  public flat<U>(this: U[][][][][][][][], depth: 7): U[]
  public flat<U>(this: U[][][][][][][], depth: 6): U[]
  public flat<U>(this: U[][][][][][], depth: 5): U[]
  public flat<U>(this: U[][][][][], depth: 4): U[]
  public flat<U>(this: U[][][][], depth: 3): U[]
  public flat<U>(this: U[][][], depth: 2): U[]
  public flat<U>(this: U[][], depth?: 1 | undefined): U[]
  public flat<U>(this: U[], depth: 0): U[]
  public flat<U>(depth?: number | undefined): any[]
  public flat(_depth?: any): any[] {
    throw new Error("Method not implemented.")
  }

  public entries = (): IterableIterator<[number, SUBTYPE]> => this.$data.entries() as any
  public keys = (): IterableIterator<number> => this.$data.keys()
  public values = (): IterableIterator<SUBTYPE>  => (this.$data.values() as any as IterableIterator<SUBTYPE>)

  public [Symbol.iterator] = (): IterableIterator<SUBTYPE> => {
    addObservedLength(this)
    return ((this.$data as any) as SUBTYPE[])[Symbol.iterator]()
  }
  public [Symbol.unscopables] = (): {
    copyWithin: boolean
    entries: boolean
    fill: boolean
    find: boolean
    findIndex: boolean
    keys: boolean
    values: boolean
  } => this.$data[Symbol.unscopables]()



  public $attach(parent: INodeInstance<any>, key: string | number): void {
    super.$attach(parent, key)
    this.$attachChildren()
  }

  public $present(
    proposal: ArrayCommand<SUBTYPE>[],
    shouldAddMigration: boolean = false
  ): void {
    proposal.forEach(command => {
      // Apply only if the path concerns this node or a leaf child.
      if (isInstancePath(this.$path, command.path)) {
        present(this, [command], shouldAddMigration)
      } else if (isOwnLeafPath(this.$path, command.path)) {
        if (isBasicCommand(command)) {
          present(this, [command], shouldAddMigration)
        } else {
          fail('[CRAFTER] Array.$applyCommand LeafInstance accepts only basic JSON write commands')
        }
      } // Or delegate to children
      else if (isChildPath(this.$path, command.path)) {
        const childInstance = this.$data[
          Number(getChildKey(this.$path, command.path))
        ]
        // Get the concerned child key
        toNode(childInstance).$present([command], shouldAddMigration)
      }
    })
  }

  /**
   * Observable value can has an unknown sub type.
   * If it is the case it is time to refined the type with by
   * infer the given value.
   */
  /*public $setValue(_value: INPUT): void {
    if (!this.$$container.isWrittable) {
      throw new Error(
        'Crafter Array. Tried to set an array value while model is locked.'
      )
    }
    if (_value.length) {
      this.refineTypeIfNeeded(_value[0])
    }
    const value = isInstance(_value) ? getSnapshot(_value) : _value

    // Reset instance
    this.$data = [] as any
    Object.keys(this).forEach(k => delete this[k])
    // Replace members
    this.$data.push(...value.map((i: SUBTYPE) => this.$createChildInstance<SUBTYPE>(i)))
    for (let i = 0; i < this.length; i++) {
      this.$addInterceptor(i)
    }
    this.$attachChildren()

    // The value of the array changed, notify the container.
    this.$$container.addUpdatedObservable(this)
  }

  public $kill(): void {
    super.$kill()
    this.$data.forEach(child => {
      kill(child, this)
    })
  }

  /**
   * Array methods implementation.
   * All methods must be bound to this instance. Because in some case, eg. Union type. The caller will be the
   * container instance (UnionInstance), not the ArrayInstance.
   */
/*
  public copyWithin = (
    target: number,
    start: number,
    end?: number | undefined
  ): this => {
    present(this, [{ op: Operation.copyWithin, path: this.$path, target, start, end }])
    return this
  }

  public concat = (
    ...items: (SUBTYPE | ConcatArray<SUBTYPE>)[]
  ): SUBTYPE[] => {
    const newArray = clone(this)

    this.$$container.transaction(() => {
      newArray.push(
        ...items.reduce<SUBTYPE[]>((_items, item) => {
          if (Array.isArray(item)) {
            return [..._items, ...item]
          } else {
            return [..._items, item]
          }
        }, [])
      )
    })

    return newArray
  }

  public filter = (
    callbackfn: (value: SUBTYPE, index: number, array: SUBTYPE[]) => boolean,
    thisArg?: ArrayInstance<SUBTYPE>
  ): SUBTYPE[] => {
    addObservedLength(this)
    return thisArg
      ? Array.prototype.filter.call(this, thisArg as any, callbackfn)
      : Array.prototype.filter.call(this, callbackfn)
  }

  public reduce(
    callbackfn: (
      previousValue: SUBTYPE,
      currentValue: SUBTYPE,
      currentIndex: number,
      array: SUBTYPE[]
    ) => SUBTYPE
  ): SUBTYPE
  public reduce<U>(
    callbackfn: (
      previousValue: U,
      currentValue: SUBTYPE,
      currentIndex: number,
      array: SUBTYPE[]
    ) => U,
    initialValue: U
  ): U
  public reduce(
    callbackfn: (
      previousValue: any,
      currentValue: any,
      currentIndex: number,
      array: any[]
    ) => any,
    initialValue?: SUBTYPE
  ): SUBTYPE {
    addObservedLength(this)
    return Array.prototype.reduce.call(this, callbackfn, initialValue) as any
  }

  public reduceRight(
    callbackfn: (
      previousValue: SUBTYPE,
      currentValue: SUBTYPE,
      currentIndex: number,
      array: SUBTYPE[]
    ) => SUBTYPE
  ): SUBTYPE
  public reduceRight<U>(
    callbackfn: (
      previousValue: U,
      currentValue: SUBTYPE,
      currentIndex: number,
      array: SUBTYPE[]
    ) => U,
    initialValue: U
  ): U
  public reduceRight(
    callbackfn: (
      previousValue: any,
      currentValue: any,
      currentIndex: number,
      array: any[]
    ) => any,
    initialValue?: SUBTYPE
  ): SUBTYPE {
    addObservedLength(this)
    return Array.prototype.reduceRight.call(
      this,
      callbackfn,
      initialValue
    ) as any
  }

  public fill = (
    value: SUBTYPE,
    start?: number | undefined,
    end?: number | undefined
  ): this => {
    present(this, [{ op: Operation.fill, path: this.$path, value, start, end }])
    return this
  }

  public find = (
    predicate: (this: void, value: any, index: number, obj: any[]) => boolean,
    thisArg?: any
  ): SUBTYPE | undefined => {
    addObservedLength(this)
    return Array.prototype.find.call(thisArg || this, predicate)
  }

  public findIndex = (
    predicate: (this: void, value: any, index: number, obj: any[]) => boolean,
    thisArg?: any
  ): number => {
    addObservedLength(this)
    return Array.prototype.findIndex.call(thisArg || this, predicate)
  }

  public indexOf = (
    searchElement: any,
    fromIndex?: number | undefined
  ): number => {
    addObservedLength(this)
    return Array.prototype.indexOf.call(this, searchElement, fromIndex)
  }

  public lastIndexOf = (
    searchElement: any,
    fromIndex?: number | undefined
  ): number => {
    addObservedLength(this)
    return Array.prototype.lastIndexOf.call(
      this,
      searchElement,
      fromIndex || this.length
    )
  }

  public every = (
    callbackfn: (value: any, index: number, array: any[]) => unknown,
    thisArg?: any
  ): boolean => {
    addObservedLength(this)
    return Array.prototype.every.call(thisArg || this, callbackfn)
  }

  public join = (separator?: string | undefined): string => {
    addObservedLength(this)
    return Array.prototype.join.call(this, separator)
  }

  public reverse = (): SUBTYPE[] => {
    present(this, [{ op: Operation.reverse, path: this.$path }])
    return this
  }

  public shift = (): SUBTYPE | undefined => {
    const item = this.$data[0]
    present(this, [{ op: Operation.shift, path: this.$path }])
    return item ? unbox(item) : undefined
  }

  public some = (
    callbackfn: (value: any, index: number, array: any[]) => unknown,
    thisArg?: any
  ): boolean => {
    addObservedLength(this)
    return Array.prototype.some.call(thisArg || this, callbackfn)
  }

  public includes = (item: SUBTYPE): boolean => {
    addObservedLength(this)
    return Array.prototype.includes.call(this, item)
  }

  public sort = (
    compareFn?: ((a: SUBTYPE, b: SUBTYPE) => number) | undefined
  ): this => {
    present(this, [{ op: Operation.sort, path: this.$path, compareFn }])
    return this
  }

  public splice = (
    start: number,
    deleteCount?: number | undefined,
    ...items: SUBTYPE[]
  ): SUBTYPE[] => {
    present(this, [
      {
        op: Operation.splice,
        path: this.$path,
        start,
        deleteCount,
        value: items.length ? items : undefined,
      },
    ])
    return this.$data
      .slice(start, start + (deleteCount || this.length))
      .map(item => unbox(item))
  }

  public slice = (
    start?: number | undefined,
    end?: number | undefined
  ): SUBTYPE[] => {
    addObservedLength(this)
    return Array.prototype.slice.call(this, start, end)
  }

  public pop = (): SUBTYPE | undefined => {
    const item = this[this.length - 1]
    present(this, [{ op: Operation.pop, path: this.$path }])
    return item
  }

  public push = (...items: (SUBTYPE | IInstance<SUBTYPE>)[]): number => {
    if (!items.length) {
      return this.length
    }

    present(this, [{ op: Operation.push, value: items, path: this.$path }])

    return this.length
  }

  public unshift = (...items: SUBTYPE[]): number => {
    if (!items.length) {
      return this.length
    }

    present(this, [{ op: Operation.unshift, value: items, path: this.$path }])

    return this.length
  }

  public toString = (): string => {
    addObservedLength(this)
    return this.$data
      .map(toNode)
      .map(item => item.$value)
      .toString()
  }

  public toLocaleString = (): string => {
    addObservedLength(this)
    return this.$data
      .map(toNode)
      .map(item => item.$value)
      .toLocaleString()
  }

  public forEach = (
    callbackfn: (value: any, index: number, array: any[]) => void
  ): void => {
    addObservedLength(this)
    Array.prototype.forEach.call(this, callbackfn)
  }

  public map<U>(
    callbackfn: (value: SUBTYPE, index: number, array: SUBTYPE[]) => U,
    thisArg?: any
  ): U[] {
    addObservedLength(this)
    return Array.prototype.map.call(this, callbackfn, thisArg) as any
  }

  public $addInterceptor(index: number | string): void {
    if (isReferenceType(this.$type.itemType)) {
      Object.defineProperty(this, index, {
        get() {
          const instance = this.$$container.getReferenceTarget(
            this.$data[index].$value
          )
          // return the instance if it is a node or the value if it is a leaf
          return instance
        },
        set(value: any) {
          this.$$container.getReferenceTarget(this.$data[index].$value).$setValue(
            value
          )
        },
        enumerable: true,
        configurable: true,
      })
    } else {
      Object.defineProperty(this, index, {
        get() {
          const instance = this.$data[index]
          // Prevent throwing if index does not exist
          if (instance) {
            // Notify the read of the child node
            if (isNode(instance)) {
              this.$$container.notifyRead(instance, makePath(getRoot(this).$id, this.$path, index.toString()))
            }
            // return the instance if it is a node or the value if it is a leaf
            return unbox(instance)
          }
        },
        set(value: any) {
          present(this, [
            { op: Operation.replace, value, path: makePath(this.$path, index.toString()) },
          ])
        },
        enumerable: true,
        configurable: true,
      })
    }
  }

  public $createChildInstance = <I = SUBTYPE>(item: I): I & IInstance<I> => 
    // @todo: remove when ref will be implemented
    (
      this.$type as ArrayType<any>).itemType.create(
      isInstance(item) ? getSnapshot(item) : item,
      { context: this.$$container }
    )
  
  public refineTypeIfNeeded(value: SUBTYPE | IInstance<SUBTYPE>) {
    if (isUnknownType(this.$type.itemType)) {
      this.$type.itemType = isInstance(value)
      ? value.$type
      : getTypeFromValue(value as any)
      // If the type is a primitive, set the flag to true
      // This will speed up the iteration by not trying to take the string a reference id.
      this.$isPrimitiveArray = isPrimitive(value)
    }
  }
  private $attachChildren = (): void => {
    this.$data.forEach((child, index) => {
      attach(child, index, this)
    })
  }
}

// Special case: sort command.
// Array.sort can take a predicate function to sort the array.
// This is only included here to be used with the Array instance
// as ArrayOperation must contains only serializable value.
type SortCommandWithCompareFn<T = any> = {
  op: Operation.sort
  path: string
  compareFn?: (a: T, b: T) => number
}

type Proposal<T = any> = ArrayCommand<T> | SortCommandWithCompareFn<T>

function replace(
  model: ArrayInstance<unknown>,
  value: any,
  index: string | number
): ReplaceChanges {
  // Some index may have been deleted by previous command
  if (model[index] === undefined) {
    model.$addInterceptor(index)
  }

  const replaced = getSnapshot(model.$data[index])
  const instance = toInstance(model.$data[index])
  instance.$setValue(value)

  // Attach
  attach(instance, Number(index), model)
  return {
    replaced,
  }
}

/**
 * Accept the value if the model is writtable
 *//*
function present(
  model: ArrayInstance<any>,
  proposal: Proposal[],
  willEmitPatch: boolean = true
): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!model.$$container.isWrittable) {
    throw new Error(
      `Crafter Array. Tried to mutate an array while model is locked. Hint: if you want sort an observable array, you must copy it first eg: [...observableArray].sort()`
    )
  }
  const proposalMigration: Migration<any, any> = {
    forward: [],
    backward: []
  }

  proposal.forEach(command => {
    if (command.op === 'replace') {
      const changes = replace(
        model,
        command.value,
        getArrayIndex(model, command)
      )
      mergeMigrations(createReplaceMigration(command, changes), proposalMigration)
    } else if (command.op === 'remove') {
      const changes = removeFromArray(model, command)
      if (changes) {
        mergeMigrations(createRemoveMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'add') {
      try {
        model.refineTypeIfNeeded(command.value)
        const index = getArrayIndex(model, command)
        add(model, command.value, index.toString())
        mergeMigrations(createAddMigration(command), proposalMigration)
      } catch (e) {
        // Is an alias of replace
        present(model, [{ ...command, op: Operation.replace }])
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      mergeMigrations(createCopyMigration(command, changes), proposalMigration)
    } else if (command.op === 'move') {
      const changes = move(model, command)
      mergeMigrations(createMoveMigration(command, changes), proposalMigration)
    } else if (command.op === 'splice') {
      const changes = splice(model, command)
      if (changes) {
        mergeMigrations(createSplicePatch(command, changes), proposalMigration)
      }
    } else if (command.op === 'copyWithin') {
      const changes = copyWithin(model, command)
      if (changes) {
        mergeMigrations(createCopyWithinPatch(command, changes), proposalMigration)
      }
    } else if (command.op === 'sort') {
      // Sort can be a serialized list of moved command (SortCommands)
      // or a command with a compMigration<CopyWithinOperation, SpliceOperation>n function (not serializable)
      const changes = isSortCommand(command)
        ? sort(model, command)
        : sortWithMoveOps(model, command.commands)
      if (changes) {
        mergeMigrations(createSortPatch(model, changes), proposalMigration)
      }
    } else if (command.op === 'fill') {
      model.refineTypeIfNeeded(command.value)
      const changes = fill(model, command)
      mergeMigrations(createFillPatch(command, changes), proposalMigration)
    } else if (command.op === 'reverse') {
      reverse(model)
      mergeMigrations(createReversePatch(command), proposalMigration)
    } else if (command.op === 'shift') {
      const changes = shift(model)
      if (changes) {
        mergeMigrations(createShiftPatch(command, changes), proposalMigration)
      }
    } else if (command.op === 'pop') {
      const changes = pop(model)
      if (changes) {
        mergeMigrations(createPopPatch(command, changes), proposalMigration)
      }
    } else if (command.op === 'push') {
      model.refineTypeIfNeeded(command.value)
      const changes = push(model, command)
      if (changes) {
        mergeMigrations(createPushPatch(model, command), proposalMigration)
      }
    } else if (command.op === 'unshift') {
      const changes = unshift(model, command)
      if (changes) {
        mergeMigrations(createUnshiftPatch(command), proposalMigration)
      }
    } else if (command.op === 'setLength') {
      const changes = setLength(model, command)
      if (changes) {
        mergeMigrations(createSetLengthPatch(model, changes), proposalMigration)
      }
    } else {
      throw new Error(`Crafter Array.$applyOperation: ${
        (proposal as any).op
      } is not a supported command. This error happened
        during a migration command. The transaction is cancelled and the model is reset to its previous value.`)
    }
  })
  // Those commands update the length of the array
  if (proposalMigration.forward.some(isShapeMutationCommand)) {
    model.$$container.addUpdatedObservable(model)
  }
  if (willEmitPatch) {
    model.$addMigration(proposalMigration)
  }
}

function generateSnapshot<T>(data: DataArray<T>, context: IContainer): T[] {
  return data.map(item => typeof item === 'string'
    ? context.getReferenceTarget<T>(item).$snapshot
    : item.$snapshot  
  ) as any
}

function generateValue<T>(data: DataArray<T>, context: IContainer): T[] {
  return data.map(item => typeof item === 'string'
    ? context.getReferenceTarget<T>(item).$value
    : item.$value  
  )
}

function build(array: ArrayInstance<any>, items: any[]): void {
  array.$$container.transaction(() => array.push(...items))
}

function push<T>(
  model: ArrayInstance<T>,
  command: PushCommand<T>
): PushChanges<T> | undefined {
  const items = command.value

  if (!items.length) {
    return
  }

  const startIndex = model.length
  const lastIndex = startIndex + items.length - 1
  model.$data.push(...items.map(model.$createChildInstance))

  for (let i = startIndex; i <= lastIndex; i++) {
    // Observe the new slots
    model.$addInterceptor(i)
    // Attach new node items
    attach(model.$data[i], i, model)
  }
  return {
    prevLength: model.length - items.length,
    added: command.value,
  }
}

function createPushPatch<T>(model: ArrayInstance<T>, proposal: PushCommand<T>): Migration<PushCommand, SpliceCommand> {
  return {
    forward: [
      {
        op: Operation.push,
        path: model.$path,
        value: proposal.value,
      },
    ],
    backward: [
      {
        op: Operation.splice,
        path: proposal.path,
        start: model.length - proposal.value.length,
        deleteCount: proposal.value.length,
      },
    ],
  }
}

function setLength<T>(
  model: ArrayInstance<T>,
  command: SetLengthCommand
): SetLengthChanges | undefined {
  const length = command.value
  const prevLength = model.length
  
  if (length === prevLength) {
    return
  }

  const removed =
    length < prevLength ? model.$data.slice(length).map(getSnapshot) : []

  // Detach and remove excedent items
  if (length < prevLength) {
    for (let i = prevLength - 1; i > length - 1; i--) {
      const excendentItem = model.$data[i]
      kill(excendentItem, model)
      delete model[i]
    }
  }

  // Set the length
  model.$data.length = length

  return {
    prevLength,
    removed,
  }
}

function createSetLengthPatch<T>(
  model: ArrayInstance<T>,
  changes: SetLengthChanges
): Migration<SetLengthCommand, SpliceCommand> {
  return {
    forward: [{
      op: Operation.setLength,
      path: model.$path,
      value: model.$data.length
    }], 
    backward: [
      {
        op: Operation.splice,
        path: model.$path,
        start:
          model.length > changes.prevLength ? changes.prevLength : model.length,
        deleteCount: changes.removed !== undefined ? 0 : changes.prevLength,
        value: changes.removed,
      },
    ],
  }
}

function kill(item: IInstance<any>, model: ArrayInstance<any>) {
  if(!model.$isPrimitiveArray && typeof item === 'string') {
    model.$$container.getReferenceTarget(item).$kill()
  } else toInstance(item).$kill()
}

function attach(item: IInstance<any>, index: number, model: ArrayInstance<any>) {
  if(!model.$isPrimitiveArray && typeof item === 'string') {
    model.$$container.getReferenceTarget(item).$attach(model, index)
  } else {
    toInstance(item).$attach(model, index)
  }
}

function removeFromArray<T>(
  model: ArrayInstance<T>,
  command: RemoveCommand
): RemoveChanges | undefined {
  const index = Number(getArrayIndex(model, command))
  const removed = getSnapshot(model.$data[index])
  const removedItem = model.$data[index]

  if (removedItem === undefined) {
    return
  }

  // Detach and free UID
  kill(removedItem, model)
  
  // Delete data
  model.$data.splice(index, 1)

  // Delete accessor
  delete model[index]

  return {
    removed,
  }
}

function splice<T>(
  model: ArrayInstance<T>,
  command: SpliceCommand<T>
): SpliceChanges | undefined {
  const { start, deleteCount, value: items = [] } = command

  // Retain the length before the splice command
  const arrayLengthBeforeSplice = model.length

  const removedItems = model.$data.splice(
    start,
    deleteCount || 0,
    ...items.map(model.$createChildInstance)
  )

  // Detach removed nodes
  removedItems.forEach(function(item) {
    kill(item, model)
  })

  // Update interceptors
  if (arrayLengthBeforeSplice < model.length) {
    for (let i = arrayLengthBeforeSplice; i < model.length; i++) {
      model.$addInterceptor(i)
    }
  }

  // Attach new nodes
  for (let i = start; i < model.$data.length; i++) {
    attach(model.$data[i], i, model)
  }

  // Delete excedent items accessors
  if (model.length < arrayLengthBeforeSplice) {
    for (let i = model.length; i < arrayLengthBeforeSplice; i++) {
      delete model[i]
    }
  }

  return {
    removed: removedItems.length
      ? ((removedItems.map(getSnapshot) as unknown) as Snapshot<T>[])
      : undefined,
    prevLength: arrayLengthBeforeSplice,
  }
}

function createSplicePatch(
  command: SpliceCommand<any>,
  changes: SpliceChanges
): Migration<SpliceCommand, SpliceCommand> {
 return {
    forward: [command],
    backward: [
      {
        op: Operation.splice,
        path: command.path,
        start: command.start,
        deleteCount: command.value?.length || 0,
        value: changes.removed,
      },
    ],
  }
}

function copyWithin<T>(
  model: ArrayInstance<T>,
  command: CopyWithinCommand
): CopyWithinChanges {
  const { target, start, end } = command
  // If target is negative, it is treated as length+target where length is the length of the array.
  const targetIndex = target < 0 ? model.length + target : target
  // If start is negative, it is treated as length+start. If end is negative, it is treated as length+end
  const startIndex =
    start < 0
      ? model.length + start
      : end && end < 0
      ? model.length - end
      : start

  const chunckSize = (end || model.length) - startIndex

  // Backup deleted items
  const replaced: T[] = []
  for (let i = target; i < (end || model.length) - start; i++) {
    const item = model.$data[i]
    replaced.push(getSnapshot(item))
    kill(item, model)
  }

  // FIXME: if we use copywithin it will create a reference between two instances.
  // The problem is that also synchronise the parent/key attachement.
  // The workaround for now is to deep clone the copied items.
  // It should be possile to use a reference Type to make a reference on the $data
  // but keep their own parent/key
  for (let i = targetIndex; i < targetIndex + chunckSize; i++) {
    model.$data[i] = model.$createChildInstance(model[startIndex + i])
    // Attach new node
    attach(model.$data[i], i, model)
  }
  return {
    replaced,
  }
}

function createCopyWithinPatch(
  command: CopyWithinCommand,
  changes: CopyWithinChanges
): Migration<CopyWithinCommand, SpliceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.splice,
        path: command.path,
        start: command.target,
        deleteCount: changes.replaced.length,
        value: changes.replaced,
      },
    ],
  }
}

function fill<T>(
  model: ArrayInstance<T>,
  command: FillCommand<T>
): FillChanges {
  // Neet to set to undefined to get the right number or arguments, otherwise it will call another Array.fill signature.
  // tslint:disable-next-line: no-unnecessary-initializer
  const { value, start = undefined, end = undefined } = command
  const backup = model.$snapshot.slice() as Snapshot<T>[]
  const replaced: Snapshot<T>[] = []

  // index to start filling the array at. If start is negative, it is treated as length+start where length is the length of the array.
  const startIndex =
    start !== undefined ? (start >= 0 ? start : model.length + start) : 0

  // index to stop filling the array at. If end is negative, it is treated as length+end.
  const endIndex =
    end !== undefined
      ? end >= 0
        ? Math.min(end, model.length)
        : model.length + end
      : model.length

  // If the item is a INodeType we create a referencable observable then fill
  // the array of references to it.
  // If it is a primitive, we fill the array with new instances.
  
  let target: INodeInstance<any> | undefined
  if (!isPrimitive(value)) {
    // The value is not a primitive, create an observable
    target = toNode(model.$createChildInstance(value))
    model.$$container.registerAsReferencable(target.$id, toNode(target))
  }
  for (let i = startIndex; i < endIndex; i++) {
    // Detach old item
    const oldItem = model.$data[i]
    kill(oldItem, model)
    if (model.$isPrimitiveArray) {
      model.$data[i] = model.$createChildInstance(value)
    } else {
      model.$data[i] = typeof value === 'string'
        ? model.$refFactory!.create(target!.$id) as any
        : model.$createChildInstance(value)
    }
    replaced.push(backup[i])
    // Attach new instance
    attach(model.$data[i], i, model)
  }

  return {
    replaced,
  }
}

function createFillPatch(
  command: FillCommand<any>,
  changes: FillChanges
): Migration<FillCommand, SpliceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.splice,
        path: command.path,
        start: command.start || 0,
        deleteCount: changes.replaced.length,
        value: changes.replaced,
      },
    ],
  }
}

function reverse<T>(model: ArrayInstance<T>): void {
  model.$data.reverse()

  // Generate migration
  for (let i = 0; i < model.length; i++) {
    // reattach nodes
    attach(model.$data[i], i, model)
  }
}

function createReversePatch(
  command: ReverseCommand
): Migration<ReverseCommand, ReverseCommand> {
  return {
    forward: [command],
    backward: [{ op: Operation.reverse, path: command.path }],
  }
}

function shift<T>(model: ArrayInstance<T>): ShiftChanges | undefined {
  const removedItem = model.$data.shift()
  if (removedItem) {
    const removedSnapshot = [getSnapshot(removedItem)]

    for (let i = 1; i < model.length; i++) {
      // As the first item is deleted, we need to shift all the nodes on the left
      // Aka: reattach them
      attach(model.$data[i], i, model)
    }

    // Detach removed item and free UID
    kill(removedItem, model)
    
    // The items are shifted, delete the last accesor which is a duplicate.
    delete model[model.length]

    return {
      removed: removedSnapshot,
      prevLength: model.length,
    }
  }
}

function createShiftPatch(
  command: ShiftCommand,
  changes: ShiftChanges
): Migration<ShiftCommand, UnshiftCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.unshift,
        path: command.path,
        value: changes.removed,
      },
    ],
  }
}

function pop(model: ArrayInstance<any>): PopChanges | undefined {
  const item = model.$data.pop()
  if (item) {
    kill(item, model)
    const removed = [getSnapshot(item)]
    return {
      removed,
      prevLength: model.length + 1,
    }
  }
}

function sort(model: ArrayInstance<any>, proposal: SortCommandWithCompareFn): SortCommands | undefined{
  // As sort can use a function in this parameters. We will convert
  // the sort function into a succession of move commands to log the changes.
  // 1- backup the actual index order
  // 2- execute the sort command on $data
  // 3- reattach nodes
  // 4- store the moved commands as a SortCommands array

  /* 1 */
/*  const oldIndexes = model.$data.map(toInstance).map(({ $id }) => $id)
  /* 2 */
/*  model.$data
    .sort(proposal.compareFn)
    /* 3 */

 /*   .forEach((instance, index) => {
      attach(instance, index, model)
    })
  
  // Return if the order did not change
  const newIndexes = model.$data.map(toInstance).map(({ $id }) => $id)
  if (newIndexes.some((id, index) => oldIndexes[index] !== id)) {
    return
  }
  
  /* 4 */
/*  return newIndexes.map((id, index) => ({
    id,
    from: oldIndexes.indexOf(id),
    to: index,
  }))
}

function isSortCommand(command: any): command is SortCommandWithCompareFn {
  return !!command.compareFn
}

function sortWithMoveOps(
  model: ArrayInstance<any>,
  sortCommands: SortCommands
): SortCommands | undefined {
  const newData = []
  for (const value of model.$data) {
    const instance = toInstance(value)
    const command = sortCommands.find(({ id }) => id === instance.$id)
    if (!command) {
      fail(
        'Crafter Array.sort. Sorting failed, command id: ' +
          instance.$id +
          ' does not exists.'
      )
      return
    }
    newData.push(model.$data[command.to])
  }
  // Replace and attach the new data set
  model.$data = newData
  model.$data.forEach((instance, index) => {
    attach(instance, index, model)
  })
  return sortCommands
}

function createSortPatch(model: ArrayInstance<any>, sortCommands: SortCommands): Migration<SortCommand, SortCommand> {
  return {
    forward: [
      {
        op: Operation.sort,
        path: model.$path,
        commands: sortCommands,
      },
    ],
    backward: [
      {
        op: Operation.sort,
        path: model.$path,
        commands: sortCommands.map(command => ({
          id: command.id,
          from: command.to,
          to: command.from,
        })),
      },
    ],
  }
}

function createPopPatch(
  command: PopCommand,
  changes: PopChanges
): Migration<PopCommand, PushCommand> {
  return {
    forward: [command],
    backward: [{ op: Operation.push, path: command.path, value: changes.removed }],
  }
}

function unshift<T>(model: ArrayInstance<T>, proposal: UnshiftCommand<T>): UnshiftChanges | undefined {
  const items = proposal.value

  if (!items.length) {
    return
  }

  const arrayLengthBeforeShift = model.length

  const prevLength = model.$data.unshift(
    ...items.map(model.$createChildInstance)
  )

  for (let i = arrayLengthBeforeShift; i < model.length; i++) {
    // Make the new indexes accesses interceptable
    model.$addInterceptor(i)
  }

  // Generate migration for new items
  for (let i = 0; i < items.length; i++) {
    // Attach new items
    attach(model.$data[i], i, model)
  }

  return {
    added: proposal.value,
    prevLength
  }
}

function createUnshiftPatch(
  proposal: UnshiftCommand<any>
): Migration<UnshiftCommand, SpliceCommand> {
  return {
    forward: [proposal],
    backward: [
      {
        op: Operation.splice,
        path: proposal.path,
        start: 0,
        deleteCount: proposal.value.length,
      },
    ]
  }
}

export type PushChanges<T> = {
  added: T | T[]
  prevLength: number
}

export type SetLengthChanges = {
  prevLength: number
  removed?: Snapshot<any>[]
}
export type SpliceChanges = {
  prevLength: number
  removed?: Snapshot<any>[]
  added?: Snapshot<any>[]
}
export type CopyWithinChanges = {
  replaced: Snapshot<any>[]
}
export type FillChanges = {
  replaced: Snapshot<any>[]
}
export type ShiftChanges = {
  prevLength: number
  removed: Snapshot<any>
}
export type PopChanges = {
  prevLength: number
  removed: Snapshot<any>
}
export type UnshiftChanges = {
  added: Snapshot<any> | Snapshot<any>[]
  prevLength: number
}

// A tupple of id which has been moved
export type SortCommands = {
  // Id of the item
  id: string
  // Where is was
  from: number
  // Where it is now
  to: number
}[]

function getArrayIndex(model: ArrayInstance<any>, proposal: Proposal): number {
  const index = Number(getChildKey(model.$path, proposal.path))
  if (!isValidArrayIndex(model, index, proposal)) {
    throw new Error(`Crafter ${index} is not a valid array index.`)
  }
  return index
}

/**
 * Return true if the string is a valid Array index.
 *//*
function isValidArrayIndex(
  model: ArrayInstance<any>,
  index: number,
  proposal: Proposal<any>
): boolean {
  const i = Number(index)
  return !isNaN(i) &&
  // TODO add can be out of positive range (and create empty slots if necessary)
  i >= 0 && // not negative i
    proposal.op === 'add'
    ? i <= model.length // add command could be an alias of push command. Must be not greater than length
    : i < model.length // other command must be in range
}

function addObservedLength(arrayInstance: ArrayInstance<any>): void {
  arrayInstance.$$container.notifyRead(arrayInstance, makePath(getRoot(arrayInstance).$id, arrayInstance.$path, 'length'))
} */