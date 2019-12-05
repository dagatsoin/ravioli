import { IType } from './IType'
import { IContainer } from '../IContainer'

export interface IInstance<TYPE, SNAPSHOT = TYPE> {
  $id: string
  $$container: IContainer
  $isInstance: true
  $type: IType<TYPE, SNAPSHOT>
  $data: any
  $snapshot: SNAPSHOT
  $value: TYPE
  $applySnapshot(snapshot: SNAPSHOT): void
  $setValue(value: SNAPSHOT): void
  $kill(): void
}
