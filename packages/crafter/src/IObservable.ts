import { Migration } from './lib/JSONPatch'

export type IObservable<T> = T & {
  $id: string
  $patch: Migration
  $transactionDidEnd(): void
}
