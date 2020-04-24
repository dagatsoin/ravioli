import { Migration } from './lib/JSONPatch'

export type IObservable = {
  readonly $id: string
  readonly $isObservable: true
  $migration: Migration
  readonly $path: string
  $transactionDidEnd(): void
}
