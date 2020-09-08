import { IType } from './IType'
import { IContainer } from '../IContainer'
import { IWithParent } from './IWithParent'
import { IObservable } from '../IObservable'
import { Command, Migration } from './JSONPatch'

export type CommandResult = Readonly<{
  accepted: boolean;
  migration?: Readonly<Migration<any, any>>;
}>

export type ProposalResult = {
  command: Command,
  result: CommandResult,
  isNodeOp: boolean
}[]

export type State = Readonly<{
  didChange: boolean
  migration: Migration
}>

export interface IInstance<TYPE, SNAPSHOT = TYPE> extends IWithParent, IObservable{
  readonly $id: string
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
  $data: any
  $state: State
  $snapshot: SNAPSHOT
  $isStale: boolean
  readonly $value: TYPE
  $createNewSnapshot(): SNAPSHOT
  $applySnapshot(snapshot: SNAPSHOT): void
  $invalidateSnapshot(): void
  $applySnapshot(snapshot: SNAPSHOT): void // Override to refine snapshot type
//  $setValue(value: SNAPSHOT): boolean
  $kill(): void
  $notifyRead(): void
  /**
   * Present an JSON command list to the instance.
   * If shouldAddMigration is true, this will emit a migration.
   */
  $present(proposal: Command[], addMigration?: boolean): void
}