import { IObservable } from '../IObservable'
import { IInstance } from './IInstance'
import { Migration, Operation } from './JSONPatch'
import { Snapshot } from './Snapshot'

export type DataObject<T> = { [key in keyof T]: IInstance<any> }
export type DataArray<T> = IInstance<T>[]
export type DataMap<K, T> = Map<K, IInstance<T>>

export type DataNode = DataArray<any> | DataObject<any> | DataMap<any, any>

export type OperationListener = (operation: Operation) => void

export type PatchListener = (migration: Migration) => void

export type RemoveChanges = {
  removed: Snapshot<any>
}
export type CopyChanges = {
  replaced: Snapshot<any>
}
export type MoveChanges = {
  moved: Snapshot<any>
  replaced: Snapshot<any>
}
export type ReplaceChanges = {
  replaced: Snapshot<any>
}
export interface INodeInstance<TYPE, SNAPSHOT = TYPE>
  extends IInstance<TYPE, SNAPSHOT>,
    IObservable<any> {
  $path: string
  $patch: Migration
  $parentKey: string | number | undefined
  $parent: INodeInstance<any> | undefined
  $isNode: true
  $nativeTypeKeys: string[] // The keys of the methods which are specific to the node type (Array, Map) and unumerables
  $addInterceptor(index: number | string): void // Attach the getter/setter listener on a child
  $createChildInstance<I>(item: I, key: string): IInstance<I>
  $invalidateSnapshot(): void
  $createNewSnapshot(): void
  $attach(parent: INodeInstance<any>, key: number | string): void
  $detach(): void
  $applySnapshot(snapshot: SNAPSHOT): void // Override to refine snapshot type
  $addPatch(patch: Migration): void
  /**
   * Apply an JSON patch operation to a node.
   * If willEmitPatch is true, this will reemit a patch. (used internally in Ravioli)
   */
  $applyOperation<O extends Operation>(operation: O, willEmitPatch?: boolean): void
  $addTransactionPatchListener(patchListener): void
  $addOperationListener(operationListener: OperationListener): void
  $removeOperationListener(operationListener: OperationListener): void
}
