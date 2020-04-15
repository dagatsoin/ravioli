import { Migration } from './lib/JSONPatch'

export type IObservable = {
  $id: string
  $isObservable: true
  $patch: Migration
  $transactionDidEnd(): void
}
