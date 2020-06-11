import { IType } from './IType'
import { IContainer } from '../IContainer'
import { IWithParent } from './IWithParent'
import { IObservable } from '../IObservable'
import { Command, Migration } from './JSONPatch'

export interface IInstance<TYPE, SNAPSHOT = TYPE> extends IWithParent, IObservable{
  readonly $id: string
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
//  $data: any
  readonly $state: {
    migration: Migration
  }
  $snapshot: SNAPSHOT
  readonly $value: TYPE
  $applySnapshot(snapshot: SNAPSHOT): void
//  $invalidateSnapshot(): void
//  $setValue(value: SNAPSHOT): boolean
  $kill(): void
  /**
   * Present an JSON command list to the instance.
   * If shouldAddMigration is true, this will emit a migration.
   */
  $present(proposal: Command[], addMigration?: boolean): void
}