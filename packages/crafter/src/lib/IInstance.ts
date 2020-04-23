import { IType } from './IType'
import { IContainer } from '../IContainer'
import { IWithParent } from './IWithParent'
import { IObservable } from '../IObservable'
import { Migration, Operation } from './JSONPatch'

export interface IInstance<TYPE, SNAPSHOT = TYPE> extends IWithParent, IObservable{
  readonly $id: string
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
  $data: any
  $snapshot: SNAPSHOT
  $value: TYPE
  $addPatch(patch: Migration): void
  $applySnapshot(snapshot: SNAPSHOT): void
  $setValue(value: SNAPSHOT): void
  $kill(): void
  $addOperationListener(operationListener: OperationListener): void
  $removeOperationListener(operationListener: OperationListener): void
}

export type OperationListener = (operation: Operation) => void