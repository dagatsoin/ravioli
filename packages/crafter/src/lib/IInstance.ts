import { IType } from './IType'
import { IContainer } from '../IContainer'
import { IWithParent } from './IWithParent'
import { IObservable } from '../IObservable'
import { Command } from './JSONPatch'

export interface IInstance<TYPE, SNAPSHOT = TYPE> extends IWithParent, IObservable{
  readonly $id: string
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
  $data: any
  $snapshot: SNAPSHOT
  $value: TYPE
  $applySnapshot(snapshot: SNAPSHOT): void
  $invalidateSnapshot(): void
  $setValue(value: SNAPSHOT): boolean
  $kill(): void
  /**
   * Present an JSON command list to the instance.
   * If shouldAddMigration is true, this will emit a migration.
   */
  $present(proposal: Command[], addMigration?: boolean): void
}