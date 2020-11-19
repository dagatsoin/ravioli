import { IInstance } from './IInstance'
import { Snapshot } from './Snapshot'

export type DataObject<T> = { [key in keyof T]: IInstance<any> }
export type DataArray<T> = (IInstance<T> | IInstance<T, string>)[]
export type DataMap<T> = Map<string, IInstance<T>>

export type DataNode = DataArray<any> | DataObject<any> | DataMap<any>

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
export type AddChanges = {
  added: Snapshot<any>
}
export type ReplaceChanges = {
  replaced: Snapshot<any>
}
export interface INodeInstance<TYPE, SNAPSHOT = TYPE>
  extends IInstance<TYPE, SNAPSHOT> {
  $isNode: true
  $parent: INodeInstance<any, any> | undefined
  $nativeTypeKeys: string[] // The keys of the methods which are specific to the node type (Array, Map) and unumerables
  $createChildInstance<I>(item: I, key: any): IInstance<I>
}
