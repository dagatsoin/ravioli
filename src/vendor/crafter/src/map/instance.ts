import { getInstance, unbox } from '../helpers'
import { IInstance } from '../lib/IInstance'
import { DataMap, INodeInstance } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import { isNode, NodeInstance } from '../lib/NodeInstance'
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../setNonEnumerable'
import * as Manager from '../STManager'
import { MapType } from './type'

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

export class MapInstance<K, T>
  extends NodeInstance<Map<K, T>, any, Array<[K, T]>>
  implements Map<K, T> {
  get size(): number {
    this.addObservedLength()
    return this.$data.size
  }
  get [Symbol.toStringTag](): string {
    return this.$data[Symbol.toStringTag]
  }
  public $type: MapType<K, T>
  public $data: DataMap<K, T>
  public $getMethodKeys(): string[] {
    throw new Error('Method not implemented.')
  }
  constructor(
    type: MapType<K, T>,
    entries?: Array<[K, T]> | Map<K, T> | MapInstance<any, any>,
    id?: string
  ) {
    // Initialize the array
    super(generateSnapshot, methodKeys, id)
    this.$type = type
    this.$data = new Map()
    build(this, entries)
    // Make all class properties non enumerable
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
  }
  public $attach(parent: INodeInstance<any>, key: string | number): void {
    this.$parent = parent
    this.$parentKey = key
    this.$attachChildren()
  }

  public $setValue(values: Map<K, T> | Array<[K, T]> | MapInstance<K, T>): void {
    if (!Manager.isWrittable()) {
      throw new Error(
        'Crafter Map. Tried to set a Map value while model is locked.'
      )
    }
    if (isInstance(values)) {
      if (!this.$type.isValidValue(values.$value)) {
        return
      }
      this.$data.clear()
      values.$value.forEach((value, key) => {
        this.set(key, value)
      })
    } else {
      if (!this.$type.isValidValue(values)) {
        return
      }
      this.$data.clear()
      if (Array.isArray(values)) {
        ;(values as Array<[K, T]>).forEach(entry => {
          const [key, value] = entry
          this.set(key, value)
        })
      } else {
        values.forEach((value, key) => {
          this.set(key, value)
        })
      }
    }
    this.$attachChildren()
    this.$addPatch({
      op: 'replace',
      path: this.$path,
      value: Array.from(this.$value.entries()),
    })
    Manager.addUpdatedObservable(this)
  }
  public clear = (): void => {
    if (!Manager.isWrittable()) {
      throw new Error(
        'Crafter Map. Tried to clear a Map item value while model is locked.'
      )
    }
    this.$addPatch({
      op: 'replace',
      path: this.$path,
      value: [[]],
    })
    this.$addPatch({
      op: 'replace',
      path: this.$path + '/size',
      value: 0,
    })
    this.$data.clear()
    Manager.addUpdatedObservable(this)
  }
  public delete = (key: K): boolean => {
    const result = this.$data.delete(key)
    Manager.addUpdatedObservable(this)
    if (result) {
      this.$addPatch({
        op: 'remove',
        path: this.$path + '/' + key,
      })
      return true
    } else {
      return false
    }
  }
  public forEach = (
    callbackfn: (value: T, key: K, map: Map<K, T>) => void,
    thisArg?: any
  ): void => {
    this.addObservedLength()
    Map.prototype.forEach.call(thisArg || this.$data, callbackfn)
  }
  public get = (key: K): T | undefined => {
    Manager.addObservedPath(this.$id + this.$path + '/' + key)
    const instance = this.$data.get(key)
    return instance ? unbox(instance) : undefined
  }
  public has = (key: K): boolean => {
    Manager.addObservedPath(this.$id + this.$path + '/' + key)
    return this.$data.has(key)
  }
  public set = (key: K, value: T | IInstance<T>): this => {
    if (!Manager.isWrittable()) {
      throw new Error(
        'Crafter Map. Tried to set a Map item value while model is locked.'
      )
    }
    // Register the object on the list of observables used for the current transaction.
    // At the end of the transaction, the manager will call onTransactionEnd on each observable.
    Manager.addUpdatedObservable(this)
    if (this.$data.has(key)) {
      this.$data.get(key)!.$setValue(value)
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/' + key,
        value,
      })
    } else {
      const item = isInstance(value)
        ? value
        : getInstance(this.$type.itemType.create(value))
      this.$data.set(key, item)
      if (isNode(item)) {
        item.$attach(this, toKey(key))
      }
      this.$addPatch({
        op: 'add',
        path: this.$path + '/' + key,
        value: item.$snapshot,
      })
      this.$addPatch({
        op: 'replace',
        path: this.$path + '/size',
        value: this.$data.size,
      })
    }
    return this
  }
  public [Symbol.iterator](): IterableIterator<[K, T]> {
    this.addObservedLength()
    return (this.$data[Symbol.iterator]() as unknown) as IterableIterator<
      [K, T]
    >
  }
  public entries(): IterableIterator<[K, T]> {
    this.addObservedLength()
    const newMap = new Map<K, T>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value))
    })
    return newMap.entries()
  }
  public keys(): IterableIterator<K> {
    this.addObservedLength()
    return this.$data.keys()
  }
  public values(): IterableIterator<T> {
    this.addObservedLength()
    const newMap = new Map<K, T>()

    this.$data.forEach((value, key) => {
      newMap.set(key, unbox(value))
    })
    return newMap.values()
  }
  private addObservedLength = () => {
    Manager.addObservedPath(this.$id + this.$path + '/size')
  }
  private $attachChildren = () => {
    this.$data.forEach((instance, k) => {
      if (isNode(instance)) {
        instance.$attach(this, toKey(k))
      }
    })
  }
}

function generateSnapshot<T>(data: DataMap<any, T>): Array<[any, Snapshot<T>]> {
  const value: Array<[any, Snapshot<T>]> = []
  data.forEach((item, key) => {
    value.push([key, item.$snapshot])
  })
  return value
}

function build(
  map: MapInstance<any, any>,
  entries: Array<[any, any]> | Map<any, any> | MapInstance<any, any> = []
) {
  Manager.transaction(() => {
    if (entries instanceof Map) {
      entries.forEach((item, key) => {
        map.set(key, item)
      })
    } else {
      const _entries = isInstance(entries) ? entries.$snapshot : entries
      _entries.forEach(entry => {
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