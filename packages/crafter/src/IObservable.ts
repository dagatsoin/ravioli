import { Migration } from './lib/JSONPatch'

export type IObservable = {
  readonly $id: string
  readonly $isObservable: true
  $patch: Migration
  $transactionDidEnd(): void
}
