import { ArrayType } from '../array/type'
import {
  clone,
  getChildKey,
  toInstance,
  toNode,
  getSnapshot,
  isChildPath,
  isNodePath,
  isOwnLeafPath,
  unbox,
  getRoot,
  path,
} from '../helpers'
import { computeNextState } from '../lib/computeNextState'
import { IInstance } from '../lib/IInstance'
import { DataArray, INodeInstance, RemoveChanges, ReplaceChanges } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import {
  ArrayOperation,
  BasicOperation,
  CopyWithinOperation,
  FillOperation,
  isBasicJSONOperation,
  Migration,
  Operation,
  PopOperation,
  PushOperation,
  RemoveOperation,
  ReverseOperation,
  SetLengthOperation,
  ShiftOperation,
  SpliceOperation,
  UnshiftOperation,
} from '../lib/JSONPatch'
import {
  add,
  addAddPatch,
  addCopyPatch,
  addMovePatch,
  addRemovePatch,
  addReplacePatch,
  copy,
  move
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { isNode } from "../lib/isNode"
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../utils/utils'
import { IContainer } from '../IContainer'
import { isUnknownType } from '../Primitive'
import { getTypeFromValue } from "../lib/getTypeFromValue"

/**
 * Code review
 * - [ ] each new node is attached
 * - [ ] each new node has an interceptor
 * - [ ] each acceptor has its dedicated patch generator
 *
 * QA
 * - [ ] I can do myArray[n] = something and it will the necessary empty slots
 */

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
        op: 'setLength',
        path: this.$path,
        value,
      },
    ])
  }

  public $type: ArrayType<SUBTYPE>
  public $data: DataArray<SUBTYPE> = []
  
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

  public $applyOperation<O extends Operation>(
    proposal: O & ArrayOperation<SUBTYPE>,
    willEmitPatch: boolean = false
  ): void {
    // Apply only if the path concerns this node or a leaf child.
    if (isNodePath(this.$path, proposal.path)) {
      present(this, [proposal], willEmitPatch)
    } else if (isOwnLeafPath(this.$path, proposal.path)) {
      if (isBasicJSONOperation(proposal)) {
        present(this, [proposal], willEmitPatch)
      } else {
        throw new Error('LeafInstance accepts only basic JSON write operations')
      }
    } // Or delegate to children
    else if (isChildPath(this.$path, proposal.path)) {
      const childInstance = this.$data[
        Number(getChildKey(this.$path, proposal.path))
      ]
      // Get the concerned child key
      toNode(childInstance).$applyOperation(proposal as BasicOperation, willEmitPatch)
    }
  }

  /**
   * Observable value can has an unknown sub type.
   * If it is the case it is time to refined the type with by
   * infer the given value.
   */
  public $setValue(_value: INPUT): void {
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
    computeNextState(this)
  }

  public $kill(): void {
    super.$kill()
    this.$data.forEach(child => {
      child.$kill()
    })
  }

  /**
   * Array methods implementation.
   * All methods must be bound to this instance. Because in some case, eg. Union type. The caller will be the
   * container instance (UnionInstance), not the ArrayInstance.
   */

  public copyWithin = (
    target: number,
    start: number,
    end?: number | undefined
  ): this => {
    present(this, [{ op: 'copyWithin', path: this.$path, target, start, end }])
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
    present(this, [{ op: 'fill', path: this.$path, value, start, end }])
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
    present(this, [{ op: 'reverse', path: this.$path }])
    return this
  }

  public shift = (): SUBTYPE | undefined => {
    const item = this.$data[0]
    present(this, [{ op: 'shift', path: this.$path }])
    return item ? unbox(item, this.$$container) : undefined
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
    present(this, [{ op: 'sort', path: this.$path, compareFn }])
    return this
  }

  public splice = (
    start: number,
    deleteCount?: number | undefined,
    ...items: SUBTYPE[]
  ): SUBTYPE[] => {
    present(this, [
      {
        op: 'splice',
        path: this.$path,
        start,
        deleteCount,
        value: items.length ? items : undefined,
      },
    ])
    return this.$data
      .slice(start, start + (deleteCount || this.length))
      .map(item => unbox(item, this.$$container))
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
    present(this, [{ op: 'pop', path: this.$path }])
    return item
  }

  public push = (...items: (SUBTYPE | IInstance<SUBTYPE>)[]): number => {
    if (!items.length) {
      return this.length
    }

    present(this, [{ op: 'push', value: items, path: this.$path }])

    return this.length
  }

  public unshift = (...items: SUBTYPE[]): number => {
    if (!items.length) {
      return this.length
    }

    present(this, [{ op: 'unshift', value: items, path: this.$path }])

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
    Object.defineProperty(this, index, {
      get() {
        const instance = this.$data[index]
        if (!isNode(instance)) {
          this.$$container.addObservedPath(path(getRoot(this).$id, this.$path, index.toString()))
        }
        return instance
          ? // Prevent throwing if index does not exist
            // Return undefined instead
            unbox(instance, this)
          : undefined
      },
      set(value: any) {
        present(this, [
          { op: 'replace', value, path: path(this.$path, index.toString()) },
        ])
      },
      enumerable: true,
      configurable: true,
    })
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
    }
  }
  
  private $attachChildren = (): void => {
    this.$data.forEach((instance, index) => {
      if (isNode(instance)) {
        instance.$attach(this, index)
      }
    })
  }
}

// Special case: sort operation.
// Array.sort can take a predicate function to sort the array.
// This is only included here to be used with the Array instance
// as ArrayOperation must contains only serializable value.
type SortCommand<T = any> = {
  op: 'sort'
  path: string
  compareFn?: (a: T, b: T) => number
}

type Proposal<T = any> = ArrayOperation<T> | SortCommand<T>

function replace(
  model: INodeInstance<unknown>,
  value: any,
  index: string | number
): ReplaceChanges {
  // Some index may have been deleted by previous operation
  if (model[index] === undefined) {
    model.$addInterceptor(index)
  }

  const replaced = getSnapshot(model.$data[index])
  const instance = toInstance(model.$data[index])
  instance.$setValue(value)

  // Attach
  if (isNode(instance)) {
    instance.$attach(model, index)
  }
  return {
    replaced,
  }
}

/**
 * Accept the value if the model is writtable
 */
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
  proposal.forEach(command => {
    if (command.op === 'replace') {
      const changes = replace(
        model,
        command.value,
        getArrayIndex(model, command)
      )
      if (willEmitPatch) {
        addReplacePatch(model, command, changes)
      }
    } else if (command.op === 'remove') {
      const changes = removeFromArray(model, command)
      if (willEmitPatch) {
        addRemovePatch(model, command, changes)
      }
    } else if (command.op === 'add') {
      try {
        const index = getArrayIndex(model, command)
        model.refineTypeIfNeeded(command.value)
        add(model, command.value, index.toString())
        if (willEmitPatch) {
          addAddPatch(model, command)
        }
      } catch (e) {
        // Is an alias of replace
        present(model, [{ ...command, op: 'replace' }])
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      if (willEmitPatch) {
        addCopyPatch(model, command, changes)
      }
    } else if (command.op === 'move') {
      const changes = move(model, command)
      if (willEmitPatch) {
        addMovePatch(model, command, changes)
      }
    } else if (command.op === 'splice') {
      const changes = splice(model, command)
      if (willEmitPatch) {
        addSplicePatch(model, command, changes)
      }
    } else if (command.op === 'copyWithin') {
      const changes = copyWithin(model, command)
      if (willEmitPatch) {
        addCopyWithinPatch(model, command, changes)
      }
    } else if (command.op === 'sort') {
      // Sort can be a serialized list of moved operation (SortCommands)
      // or a command with a compareFn function (not serializable)
      if (isSortCommand(command)) {
        const changes = sort(model, command)
        if (willEmitPatch) {
          addSortPatch(model, changes)
        }
      } else {
        const changes = sortWithMoveOps(model, command.commands)
        if (willEmitPatch) {
          addSortPatch(model, changes)
        }
      }
    } else if (command.op === 'fill') {
      const changes = fill(model, command)
      model.refineTypeIfNeeded(command.value)
      if (willEmitPatch) {
        addFillPatch(model, command, changes)
      }
    } else if (command.op === 'reverse') {
      reverse(model)
      if (willEmitPatch) {
        addReversePatch(model, command)
      }
    } else if (command.op === 'shift') {
      const changes = shift(model)
      if (willEmitPatch && changes) {
        addShiftPatch(model, command, changes)
      }
    } else if (command.op === 'pop') {
      const changes = pop(model)
      if (willEmitPatch && changes) {
        addPopPatch(model, command, changes)
      }
    } else if (command.op === 'push') {
      push(model, command)
      model.refineTypeIfNeeded(command.value)
      if (willEmitPatch) {
        addPushPatch(model, command)
      }
    } else if (command.op === 'unshift') {
      unshift(model, command)
      if (willEmitPatch) {
        addUnshiftPatch(model, command)
      }
    } else if (command.op === 'setLength') {
      const changes = setLength(model, command)
      if (willEmitPatch) {
        addSetLengthPatch(model, changes)
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

function generateSnapshot<T>(data: DataArray<T>): T[] {
  return data.map(item => item.$snapshot)
}

function generateValue<T>(data: DataArray<T>): T[] {
  return data.map(item => item.$value)
}

function build(array: ArrayInstance<any>, items: any[]): void {
  array.$$container.transaction(() => array.push(...items))
}

function push<T>(
  model: ArrayInstance<T>,
  proposal: PushOperation<T>
): PushChanges<T> {
  const items = proposal.value
  const startIndex = model.length
  const lastIndex = startIndex + items.length - 1
  model.$data.push(...items.map(model.$createChildInstance))

  for (let i = startIndex; i <= lastIndex; i++) {
    // Observe the new slots
    model.$addInterceptor(i)
    // Attach new node items
    const instance = toInstance(model.$data[i])
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
  }
  return {
    prevLength: model.length - items.length,
    added: proposal.value,
  }
}

function addPushPatch<T>(model: ArrayInstance<T>, proposal: PushOperation<T>): void {
  model.$addPatch({
    forward: [
      {
        op: 'push',
        path: model.$path,
        value: proposal.value,
      },
    ],
    backward: [
      {
        op: 'splice',
        path: proposal.path,
        start: model.length - proposal.value.length,
        deleteCount: proposal.value.length,
      },
    ],
  })
}

function setLength<T>(
  model: ArrayInstance<T>,
  proposal: SetLengthOperation
): SetLengthChanges {
  const length = proposal.value
  const prevLength = model.length
  const removed =
    length < prevLength ? model.$data.slice(length).map(getSnapshot) : []

  // Detach and remove excedent items
  if (length < prevLength) {
    for (let i = prevLength - 1; i > length - 1; i--) {
      const excendentItem = model.$data[i]
      excendentItem.$kill()
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

function addSetLengthPatch<T>(
  model: ArrayInstance<T>,
  changes: SetLengthChanges
): void {
  const patch: Migration = {
    forward: [{
      op: 'setLength',
      path: model.$path,
      value: model.$data.length
    }], 
    backward: [
      {
        op: 'splice',
        path: model.$path,
        start:
          model.length > changes.prevLength ? changes.prevLength : model.length,
        deleteCount: changes.removed !== undefined ? 0 : changes.prevLength,
        value: changes.removed,
      },
    ],
  }
  model.$addPatch(patch)
}

function removeFromArray<T>(
  model: ArrayInstance<T>,
  proposal: RemoveOperation
): RemoveChanges {
  const index = Number(getArrayIndex(model, proposal))
  const removed = getSnapshot(model.$data[index])
  const removedItem = model.$data[index]

  // Detach and free UID
  removedItem.$kill()
  
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
  proposal: SpliceOperation<T>
): SpliceChanges {
  const { start, deleteCount, value: items = [] } = proposal

  // Retain the length before the splice operation
  const arrayLengthBeforeSplice = model.length

  const removedItems = model.$data.splice(
    start,
    deleteCount || 0,
    ...items.map(model.$createChildInstance)
  )

  // Detach removed nodes
  removedItems.forEach(function(item) {
    item.$kill()
  })

  // Update interceptors
  if (arrayLengthBeforeSplice < model.length) {
    for (let i = arrayLengthBeforeSplice; i < model.length; i++) {
      model.$addInterceptor(i)
    }
  }

  // Attach new nodes
  for (let i = start; i < model.$data.length; i++) {
    const instance = model[i]
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
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

function addSplicePatch(
  model: ArrayInstance<any>,
  proposal: SpliceOperation<any>,
  changes: SpliceChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'splice',
        path: proposal.path,
        start: proposal.start,
        deleteCount: proposal.value?.length || 0,
        value: changes.removed,
      },
    ],
  })
}

function copyWithin<T>(
  model: ArrayInstance<T>,
  proposal: CopyWithinOperation
): CopyWithinChanges {
  const { target, start, end } = proposal
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
    item.$kill()
  }

  // FIXME: if we use copywithing it will create a reference between two instances.
  // The problem is that also synchronise the parent/key attachement.
  // The workaround for now is to deep clone the copied items.
  // It should be possile to use a reference Type to make a reference on the $data
  // but keep their own parent/key
  for (let i = targetIndex; i < targetIndex + chunckSize; i++) {
    model.$data[i] = model.$createChildInstance(model[startIndex + i])
    // Attach new node
    const newNode = model[i]
    if (isNode(newNode)) {
      newNode.$attach(model, i)
    }
  }
  return {
    replaced,
  }
}

function addCopyWithinPatch(
  model: ArrayInstance<any>,
  proposal: CopyWithinOperation,
  changes: CopyWithinChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'splice',
        path: proposal.path,
        start: proposal.target,
        deleteCount: changes.replaced.length,
        value: changes.replaced,
      },
    ],
  })
}

function fill<T>(
  model: ArrayInstance<T>,
  proposal: FillOperation<T>
): FillChanges {
  // Neet to set to undefined to get the right number or arguments, otherwise it will call another Array.fill signature.
  // tslint:disable-next-line: no-unnecessary-initializer
  const { value, start = undefined, end = undefined } = proposal
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

  // FIXME: if we use fill it will create a reference between two instances.
  // The problem is that also synchronise the parent/key attachement.
  // The workaround for now is to deep clone the copied items.
  // It should be possile to use a reference Type to make a reference on the $data
  // but keep their own parent/key
  for (let i = startIndex; i < endIndex; i++) {
    // Detach old item
    const oldItem = model.$data[i]
    oldItem.$kill()
    model.$data[i] = model.$createChildInstance(value)
    replaced.push(backup[i])
    // Attach new nodes
    const instance = model[i]
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
  }
  return {
    replaced,
  }
}

function addFillPatch(
  model: ArrayInstance<any>,
  proposal: FillOperation<any>,
  changes: FillChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'splice',
        path: proposal.path,
        start: proposal.start || 0,
        deleteCount: changes.replaced.length,
        value: changes.replaced,
      },
    ],
  })
}

function reverse<T>(model: ArrayInstance<T>): void {
  model.$data.reverse()

  // Generate patch
  for (let i = 0; i < model.length; i++) {
    // reattach nodes
    const instance = model[i]
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
  }
}

function addReversePatch<T>(
  model: ArrayInstance<T>,
  proposal: ReverseOperation
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [{ op: 'reverse', path: proposal.path }],
  })
}

function shift<T>(model: ArrayInstance<T>): ShiftChanges | undefined {
  const removedItem = model.$data.shift()
  if (removedItem) {
    const removedSnapshot = [getSnapshot(removedItem)]

    for (let i = 1; i < model.length; i++) {
      // As the first item is deleted, we need to shift all the nodes on the left
      // Aka: reattach them
      const instance = model[i]
      if (isNode(instance)) {
        instance.$attach(model, i - 1)
      }
    }

    // Detach removed item and free UID
    removedItem.$kill()
    
    // The items are shifted, delete the last accesor which is a duplicate.
    delete model[model.length]

    return {
      removed: removedSnapshot,
      prevLength: model.length,
    }
  }
}

function addShiftPatch<T>(
  model: ArrayInstance<T>,
  proposal: ShiftOperation,
  changes: ShiftChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'unshift',
        path: proposal.path,
        value: changes.removed,
      },
    ],
  })
}

function pop(model: ArrayInstance<any>): PopChanges | undefined {
  const item = model.$data.pop()
  if (item) {
    item.$kill()
    const removed = [getSnapshot(item)]
    return {
      removed,
      prevLength: model.length + 1,
    }
  }
}

function sort(model: ArrayInstance<any>, proposal: SortCommand): SortCommands {
  // As sort can use a function in this parameters. We will convert
  // the sort function into a succession of move operations to log the changes.
  // 1- backup the actual index order
  // 2- execute the sort operation on $data
  // 3- reattach nodes
  // 4- store the moved operations as a SortCommands array

  /* 1 */
  const oldIndexes = model.$data.map(toInstance).map(({ $id }) => $id)
  /* 2 */
  model.$data
    .sort(proposal.compareFn)
    /* 3 */

    .forEach((instance, index) => {
      if (isNode(instance)) {
        instance.$attach(model, index)
      }
    })
  /* 4 */
  return model.$data.map(toInstance).map(({ $id: id }, to) => ({
    id,
    from: oldIndexes.indexOf(id),
    to,
  }))
}

function isSortCommand(command: any): command is SortCommand {
  return !!command.compareFn
}

function sortWithMoveOps(
  model: ArrayInstance<any>,
  sortCommands: SortCommands
): SortCommands {
  const newData = model.$data.map(toInstance).map(function(instance) {
    const command = sortCommands.find(({ id }) => id === instance.$id)
    if (!command) {
      throw new Error(
        'Crafter Array.sort. Sorting failed, command id: ' +
          instance.$id +
          ' does not exists.'
      )
    }
    return model.$data[command.to]
  })
  // Replace and attach the new data set
  model.$data = newData
  model.$data.forEach((instance, index) => {
    if (isNode(instance)) {
      instance.$attach(model, index)
    }
  })
  return sortCommands
}

function addSortPatch(model: ArrayInstance<any>, sortCommands: SortCommands): void {
  model.$addPatch({
    forward: [
      {
        op: 'pop',
        path: model.$path,
        commands: sortCommands,
      },
    ],
    backward: [
      {
        op: 'sort',
        path: model.$path,
        commands: sortCommands.map(command => ({
          id: command.id,
          from: command.to,
          to: command.from,
        })),
      },
    ],
  })
}

function addPopPatch(
  model: ArrayInstance<any>,
  proposal: PopOperation,
  changes: PopChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [{ op: 'push', path: proposal.path, value: changes.removed }],
  })
}

function unshift<T>(model: ArrayInstance<T>, proposal: UnshiftOperation<T>): void {
  const items = proposal.value
  const arrayLengthBeforeShift = model.length

  model.$data.unshift(
    // Don't even validate the value, if it crash it is the dev fault
    ...items.map(model.$createChildInstance)
  )

  for (let i = arrayLengthBeforeShift; i < model.length; i++) {
    // Make the new indexes accesses interceptable
    model.$addInterceptor(i)
    // Re attach moved items
    const instance = model.$data[i]
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
  }

  // Generate patch for new items
  for (let i = 0; i < items.length; i++) {
    // Attach new items
    const instance = model.$data[i]
    if (isNode(instance)) {
      instance.$attach(model, i)
    }
  }
}

function addUnshiftPatch(
  model: ArrayInstance<any>,
  proposal: UnshiftOperation<any>
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'splice',
        path: proposal.path,
        start: 0,
        deleteCount: proposal.value.length,
      },
    ],
  })
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
 */
function isValidArrayIndex(
  model: INodeInstance<any>,
  index: number,
  proposal: Proposal<any>
): boolean {
  const i = Number(index)
  return !isNaN(i) &&
  // TODO add can be out of positive range (and create empty slots if necessary)
  i >= 0 && // not negative i
    proposal.op === 'add'
    ? i <= model.length // add operation could be an alias of push operation. Must be not greater than length
    : i < model.length // other operation must be in range
}

function addObservedLength(arrayInstance: ArrayInstance<any>): void {
  arrayInstance.$$container.addObservedPath(path(getRoot(arrayInstance).$id, arrayInstance.$path, 'length'))
}