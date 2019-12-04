import { IObservable } from '../IObservable'
import { IInstance } from './IInstance'
import { Operation } from './JSONPatch'
import { Snapshot } from './Snapshot'

export type DataObject<T> = { [key in keyof T]: IInstance<any> }
export type DataArray<T> = Array<IInstance<T>>
export type DataMap<K, T> = Map<K, IInstance<T>>

export type DataNode = DataArray<any> | DataObject<any> | DataMap<any, any>

export interface INodeInstance<T, S extends Snapshot<T> = Snapshot<T>>
  extends IInstance<T, S>,
    IObservable {
  $path: string
  $patch: Operation[]
  $parentKey: string | number | undefined
  $parent: INodeInstance<any> | undefined
  $isNode: true
  $nativeTypeKeys: string[] // The keys of the methods which are specific to the node type (Array, Map) and unumerables
  $attach(parent: INodeInstance<any>, key: number | string): void
  $applySnapshot(snapshot: S): void // Override to refine snapshot type
  $addPatch(op: Operation): void
}

export type NodeTree<T> = { [K in keyof T]: T[K] & IInstance<T> }
