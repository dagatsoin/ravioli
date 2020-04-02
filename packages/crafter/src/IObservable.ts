import { Migration } from './lib/JSONPatch'

export type IObservable<T> = T & {
  $id: string
  $isObservable: true
  $patch: Migration
  $transactionDidEnd(): void
}
