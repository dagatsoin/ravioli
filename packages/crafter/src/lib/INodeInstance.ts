import { IObservable } from '../IObservable'
import { IInstance } from './IInstance'
import { Migration, Operation } from './JSONPatch'
import { Snapshot } from './Snapshot'
import { IWithParent } from './IWithParent'

export type DataObject<T> = { [key in keyof T]: IInstance<any> }
export type DataArray<T> = (IInstance<T> | IInstance<T, string>)[]
export type DataMap<T> = Map<string, IInstance<T>>

export type DataNode = DataArray<any> | DataObject<any> | DataMap<any>

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
  extends IInstance<TYPE, SNAPSHOT>, IWithParent,
    IObservable {
  $isNode: true
  $parent: INodeInstance<any, any> | undefined
  $nativeTypeKeys: string[] // The keys of the methods which are specific to the node type (Array, Map) and unumerables
  $addInterceptor(index: number | string): void // Attach the getter/setter listener on a child
  $createChildInstance<I>(item: I, key: string): IInstance<I>
  $invalidateSnapshot(): void
  $createNewSnapshot(): void
  $applySnapshot(snapshot: SNAPSHOT): void // Override to refine snapshot type
  /**
   * Apply an JSON patch operation to a node.
   * If willEmitPatch is true, this will reemit a patch. (used internally in Ravioli)
   */
  $applyOperation<O extends Operation>(operation: O, willEmitPatch?: boolean): void
  $addTransactionPatchListener(patchListener: PatchListener): void
}
