import { ArrayType } from '../array/type'
import { clone, getNode, unbox } from '../helpers'
import { IInstance } from '../lib/IInstance'
import { DataArray, INodeInstance } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import { isNode, NodeInstance } from '../lib/NodeInstance'
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../setNonEnumerable'
import * as STManager from '../STManager'

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

export class ArrayInstance<T> extends NodeInstance<T[], any>
  implements Array<T> {
  [n: number]: T
  get length(): number {
    this.addObservedLength()
    return this.$data.length
  }

  set length(value: number) {
    if (!STManager.isWrittable()) return
    this.$data.length = value
    this.addLengthOperation()
    STManager.addUpdatedObservable(this)
  }
  public $type: ArrayType<T>
  public $data: DataArray<T>;

  public entries = () => (this.$data.entries() as any) as IterableIterator<[number, T]>
  public keys = () => this.$data.keys()
  public values = () => (this.$data.values() as any) as IterableIterator<T>;

  public [Symbol.iterator] = (): IterableIterator<T> => {
    this.addObservedLength()
    return ((this.$data as any) as T[])[Symbol.iterator]()
  };
  public [Symbol.unscopables] = (): {
    copyWithin: boolean
    entries: boolean
    fill: boolean
    find: boolean
    findIndex: boolean
    keys: boolean
    values: boolean
  } => this.$data[Symbol.unscopables]()

  constructor(type: ArrayType<T>, items: T[] | ArrayInstance<T>, id?: string) {
    // Initialize the array
    super(generateSnapshot, methodKeys, id)
    this.$type = type
    this.$data = [] as any
    // Make all class properties non enumerable
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    build(this, items)
  }

  public $attach(parent: INodeInstance<any>, key: string | number): void {
    this.$parent = parent
    this.$parentKey = key
    this.$attachChildren()
  }

  public $setValue(value: Array<T | IInstance<T>>): void {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to set an array value while model is locked.'
      )
    }
    // If value is already an instance, replace the props
    if (isInstance(value)) {
      if (!this.$type.isValidValue(value.$value)) {
        return
      }
      // Reset instance
      this.$data = [] as any
      Object.keys(this).forEach(k => delete this[k])
      // Replace members
      this.$data.push(...value.$data)
      for (let i = 0; i < this.length; i++) {
        this.addInterceptor(i)
      }
    } else {
      // Check the value
      if (!this.$type.isValidValue(value)) {
        return
      }
      this.splice(0, this.length, ...(value as T[]))
    }
    this.$attachChildren()
    STManager.addUpdatedObservable(this)
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
    // If target is negative, it is treated as length+target where length is the length of the array.
    const targetIndex = target < 0 ? this.length + target : target
    // If start is negative, it is treated as length+start. If end is negative, it is treated as length+end
    const startIndex =
      start < 0
        ? this.length + start
        : end && end < 0
        ? this.length - end
        : start

    const chunckSize = (end || this.length) - startIndex

    this.$data.copyWithin(target, start, end)

    // The instance was modified and is now staled
    STManager.addUpdatedObservable(this)

    for (let i = targetIndex; i < targetIndex + chunckSize; i++) {
      this.$addPatch({
        op: 'copy',
        from: this.$path + '/' + (startIndex + i),
        path: this.$path + '/' + i,
      })

      // Attach new node
      const instance = this[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    return this
  }

  public concat = (...items: Array<T | ConcatArray<T>>): T[] => {
    const newArray = clone(this)

    STManager.transaction(() => {
      newArray.push(
        ...items.reduce<T[]>((_items, item) => {
          if (Array.isArray(item)) {
            return [..._items, ...item.map(this.$createItem)]
          } else {
            return [..._items, this.$createItem((item as unknown) as T)]
          }
        }, [])
      )
    })

    return newArray
  }

  public filter = (
    callbackfn: (value: T, index: number, array: T[]) => boolean,
    thisArg?: ArrayInstance<T>
  ): T[] => {
    this.addObservedLength()
    return thisArg
      ? Array.prototype.filter.call(this, thisArg, callbackfn)
      : Array.prototype.filter.call(this, callbackfn)
  }

  public reduce = (
    callbackfn: (
      previousValue: any,
      currentValue: any,
      currentIndex: number,
      array: any[]
    ) => any,
    initialValue?: T
  ): T => {
    this.addObservedLength()
    return this.$data.reduce(callbackfn, initialValue)
  }

  public reduceRight = (
    callbackfn: (
      previousValue: any,
      currentValue: any,
      currentIndex: number,
      array: any[]
    ) => any,
    initialValue?: T
  ): T => {
    this.addObservedLength()
    return this.$data.reduceRight(callbackfn, initialValue)
  }

  public fill = (
    value: T,
    start?: number | undefined,
    end?: number | undefined
  ): this => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to shift an array while model is locked. Hint if you are in an observer function use Arr.slice().fill()'
      )
    }
    this.$data.fill(this.$createItem(value), start, end)

    // Generate the patch

    // index to start filling the array at. If start is negative, it is treated as length+start where length is the length of the array.
    const startIndex =
      start !== undefined ? (start >= 0 ? start : this.length + start) : 0

    // index to stop filling the array at. If end is negative, it is treated as length+end.
    const endIndex =
      end !== undefined
        ? end >= 0
          ? Math.max(end, this.length)
          : this.length + end
        : this.length

    for (let i = startIndex; i < endIndex; i++) {
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/' + i,
        value: this[i],
      })

      // Attach new nodes
      const instance = this[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    STManager.addUpdatedObservable(this)

    return this
  }

  public find = (
    predicate: (this: void, value: any, index: number, obj: any[]) => boolean,
    thisArg?: any
  ): T | undefined => {
    this.addObservedLength()
    return Array.prototype.find.call(thisArg || this, predicate)
  }

  public findIndex = (
    predicate: (this: void, value: any, index: number, obj: any[]) => boolean,
    thisArg?: any
  ): number => {
    this.addObservedLength()
    return Array.prototype.findIndex.call(thisArg || this, predicate)
  }

  public indexOf = (searchElement: any, fromIndex?: number | undefined): number => {
    this.addObservedLength()
    return Array.prototype.indexOf.call(this, searchElement, fromIndex)
  }

  public lastIndexOf = (
    searchElement: any,
    fromIndex?: number | undefined
  ): number => {
    this.addObservedLength()
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
    this.addObservedLength()
    return Array.prototype.every.call(thisArg || this, callbackfn)
  }

  public join = (separator?: string | undefined): string => {
    this.addObservedLength()
    return Array.prototype.join.call(this, separator)
  }

  public reverse = (): T[] => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to reverse an array while model is locked. Hint: if you want reverse an observable array, you must copy it first eg: [...observableArray].reverse()'
      )
    }
    this.$data.reverse()

    // Generate patch
    for (let i = 0; i < this.length; i++) {
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/' + i,
        value: this[i],
      })

      // Attach new nodes
      const instance = this[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    STManager.addUpdatedObservable(this)

    return this
  }

  public shift = (): T | undefined => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to shift an array while model is locked.'
      )
    }
    const item = this.$data.shift()
    delete this[this.length]

    // Generate patch
    for (let i = 0; i < this.length; i++) {
      this.$addPatch({
        op: 'move',
        from: this.$path + '/' + (i + 1),
        path: this.$path + '/' + i,
      })
      // Attach new nodes
      const instance = this[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    this.$addPatch({
      op: 'remove',
      path: this.$path + '/' + this.length,
    })
    this.addLengthOperation()

    STManager.addUpdatedObservable(this)

    return item ? unbox(item) : undefined
  }

  public some = (
    callbackfn: (value: any, index: number, array: any[]) => unknown,
    thisArg?: any
  ): boolean => {
    this.addObservedLength()
    return Array.prototype.some.call(thisArg || this, callbackfn)
  }

  public includes = (item: T): boolean => {
    this.addObservedLength()
    return Array.prototype.includes.call(this, item)
  }

  public sort = (compareFn?: ((a: T, b: T) => number) | undefined): this => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to sort an array while model is locked. Hint: if you want sort an observable array, you must copy it first eg: [...observableArray].sort()'
      )
    }
    this.$data.sort((a, b) => {
      if (compareFn) {
        return compareFn(unbox(a), unbox(b))
      } else return unbox(a) > unbox(b) ? 1 : -1
    })

    this.$data.forEach((instance, index) => {
      // Re attach
      if (isNode(instance)) {
        instance.$attach(this, index)
      }
      // Generate patch
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/' + index,
        value: this[index],
      })
    })

    STManager.addUpdatedObservable(this)

    return this
  }

  public splice = (
    start: number,
    deleteCount?: number | undefined,
    ...items: T[]
  ): T[] => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to splice an array while model is locked. Hint: if you want sort an observable array, you must copy it first eg: [...observableArray].sort()'
      )
    }
    // Retain the length before the splice operation
    const arrayLengthBeforeSplice = this.length

    const removedItems = this.$data.splice(
      start,
      deleteCount || 0,
      ...items.map(this.$createItem)
    )
    // Update interceptors
    if (arrayLengthBeforeSplice < this.length) {
      for (let i = arrayLengthBeforeSplice; i < this.length; i++) {
        this.addInterceptor(i)
      }
    }

    // Attach new nodes
    for (let i = start; i < this.$data.length; i++) {
      const instance = this[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    // The instance was modified and is now staled
    STManager.addUpdatedObservable(this)

    // Generate patchs

    // splice(1, 1, "e", "f");
    // ["a", "b", "c", "d"]
    // ["a", "e", "f", "c", "d"]
    // Shift items
    const hasItemsToShift = start + (deleteCount || 0) < arrayLengthBeforeSplice

    if (hasItemsToShift) {
      const shift = -(deleteCount || 0) + items.length // 1
      for (
        let i = start + (deleteCount || 0) - 1; // 1 + 1 + 2 = 3
        i < arrayLengthBeforeSplice; // 4
        i++
      ) {
        // if the index is out of array
        if (start + i + shift > arrayLengthBeforeSplice) {
          this.$addPatch({
            op: 'add',
            path: this.$path + '/' + (start + i + shift),
            value: this[start + i],
          })
        } else {
          // else move
          this.$addPatch({
            op: 'move',
            path: this.$path + '/' + (start + i + shift),
            from: this.$path + '/' + (start + i),
          })
        }
      }
    }
    // Add items
    if (items.length) {
      for (let i = 0; i < items.length; i++) {
        this.$addPatch({
          op: 'replace',
          path: this.$path + '/' + (start + i),
          value: this[start + i],
        })
      }
    }

    // Delete excedent items
    if (this.length < arrayLengthBeforeSplice) {
      for (let i = this.length; i < arrayLengthBeforeSplice; i++) {
        this.$addPatch({
          op: 'remove',
          path: this.$path + '/' + i,
        })
      }
    }

    if (arrayLengthBeforeSplice !== this.length) {
      this.addLengthOperation()
    }

    return removedItems.map(unbox)
  }

  public slice = (start?: number | undefined, end?: number | undefined): T[] => {
    this.addObservedLength()
    return Array.prototype.slice.call(this, start, end)
  }

  public pop = (): T | undefined => {
    if (!STManager.isWrittable()) {
      throw new Error('Array. Tried to pop an array while model is locked.')
    }
    if (this.length) {
      const removedIndex = this.length
      delete this[removedIndex]
      const item = this.$data.pop()

      // Generate patch
      this.$addPatch({ op: 'remove', path: this.$path + '/' + removedIndex })
      this.addLengthOperation()

      STManager.addUpdatedObservable(this)

      return item ? unbox(item) : undefined
    }
    return undefined
  }

  public push = (...items: Array<T | IInstance<T>>): number => {
    if (!STManager.isWrittable()) {
      throw new Error('Array. Tried to push an array while model is locked.')
    }
    if (!items.length) {
      return this.length
    }

    const startIndex = this.length
    const lastIndex = startIndex + items.length - 1

    this.$data.push(
      // Don't even validate the value, if it crash it is the dev fault
      ...items.map(this.$createItem)
    )
    for (let i = startIndex; i <= lastIndex; i++) {
      // Attach new node items
      if (isNode(this.$data[i])) {
        getNode(this.$data[i]).$attach(this, i)
      }
      // Observe the new slots
      this.addInterceptor(i)
      this.$addPatch({
        op: 'add',
        path: this.$path + '/' + i,
        value: this[i],
      })
    }
    this.addLengthOperation()

    STManager.addUpdatedObservable(this)
    return this.length
  }

  public unshift = (...items: T[]): number => {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter Array. Tried to unshift an array while model is locked.'
      )
    }
    const arrayLengthBeforeShift = this.length

    if (!items.length) {
      return this.length
    }

    this.$data.unshift(
      // Don't even validate the value, if it crash it is the dev fault
      ...items.map(this.$createItem)
    )

    for (let i = arrayLengthBeforeShift; i < this.length; i++) {
      const index = this.length - 1
      // Make the new indexes accesses interceptable
      this.addInterceptor(index)
      // Generate patch for items moved to new indexes
      this.$addPatch({
        op: 'add',
        path: this.$path + '/' + index,
        value: this[index],
      })
      // Re attach moved items
      const instance = this.$data[i]
      if (isNode(instance)) {
        instance.$attach(this, index)
      }
    }

    // Generate patch for shifted items
    for (let i = this.length - items.length - 1; i > items.length - 1; i--) {
      this.$addPatch({
        op: 'move',
        path: this.$path + '/' + i,
        from: this.$path + '/' + (i - items.length),
      })
      // Re attach moved items
      const instance = this.$data[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    // Generate patch for new items
    for (let i = 0; i < items.length; i++) {
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/' + i,
        value: this[i],
      })
      // Attach new items
      const instance = this.$data[i]
      if (isNode(instance)) {
        instance.$attach(this, i)
      }
    }

    this.addLengthOperation()

    STManager.addUpdatedObservable(this)
    return this.length
  }

  public toString = () => {
    this.addObservedLength()
    return this.$data
      .map(getNode)
      .map(item => item.$value)
      .toString()
  }

  public toLocaleString = () => {
    this.addObservedLength()
    return this.$data
      .map(getNode)
      .map(item => item.$value)
      .toLocaleString()
  }

  public forEach = (
    callbackfn: (value: any, index: number, array: any[]) => void,
    thisArg?: any
  ) => {
    this.addObservedLength()
    Array.prototype.forEach.call(this, callbackfn)
  }

  public map = <U>(
    callbackfn: (value: any, index: number, array: any[]) => U,
    thisArg?: any
  ): U[] => {
    this.addObservedLength()
    return Array.prototype.map.call(this, callbackfn)
  }

  private addLengthOperation() {
    this.$addPatch({
      op: 'replace',
      path: this.$path + '/length',
      value: this.length,
    })
  }

  private addObservedLength = () => {
    STManager.addObservedPath(this.$id + this.$path + '/length')
  }

  private addInterceptor(index: number) {
    Object.defineProperty(this, index, {
      get() {
        STManager.addObservedPath(this.$id + this.$path + '/' + index)
        const instance = this.$data[index]
        return isNode(instance) ? instance : instance.$value
      },
      set(value: any) {
        // No direct manipulation. Mutations must occure only during a transaction.
        if (!STManager.isWrittable()) {
          return
        }
        // Register the object on the list of observables used for the current transaction.
        // At the end of the transaction, the manager will call onTransactionEnd on each observable.
        STManager.addUpdatedObservable(this)

        this.$data[index].$setValue(value)

        this.$addPatch({
          op: 'replace',
          path: this.$path + '/' + index,
          value,
        })
      },
      enumerable: true,
      configurable: true,
    })
  }
  private $createItem = <I>(item: I | IInstance<I>): I & IInstance<I> => {
    return isInstance(item)
      ? item
      : (this.$type as ArrayType<any>).itemType.create(item)
  }
  private $attachChildren = () => {
    this.$data.forEach((instance, index) => {
      if (isNode(instance)) {
        instance.$attach(this, index)
      }
    })
  }
}

function generateSnapshot<T extends IInstance<T>>(data: DataArray<T>): Array<Snapshot<T>> {
  const snapshot = data.map(item => item.$snapshot)
  return snapshot
}

function build(array: ArrayInstance<any>, items: any[]) {
  STManager.transaction(() => array.push(...items))
}