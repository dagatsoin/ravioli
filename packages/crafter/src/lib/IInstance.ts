import { IType } from './IType'
import { IContainer, Proposal } from '../IContainer'
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

export interface IInstance<TYPE, SNAPSHOT = TYPE> extends IObservable {
  readonly $id: string
  readonly $path: string
  $parentKey: string | number | undefined
  $parent: IInstance<any> | undefined
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
  $data: any
  $state: State
  $hasStaleSnapshot: boolean
  readonly $snapshot: SNAPSHOT
  $hasStaleValue: boolean
  readonly $value: TYPE
  $attach(parent: IInstance<any>, key: number | string | Symbol): void
  $detach(): void
  $createNewSnapshot(): SNAPSHOT
  $applySnapshot(snapshot: SNAPSHOT): void
  $invalidate(): void
  $applySnapshot(snapshot: SNAPSHOT): void // Override to refine snapshot type
//  $setValue(value: SNAPSHOT): boolean
  $kill(): void
  $notifyRead(): void
  /**
   * Present an JSON command list to the instance.
   * If shouldAddMigration is true, this will emit a migration.
   */
  $present(proposal: Proposal<Command>, addMigration?: boolean): void
}