import { IType } from './IType'
import { Snapshot } from "./Snapshot";

export interface IInstance<T, S = Snapshot<T>> {
  $isInstance: true
  $type: IType<T>
  $data: any
  $snapshot: S
  $value: T
  $applySnapshot(snapshot: S): void
  $setValue(value: T | IInstance<T, any>): void
}
