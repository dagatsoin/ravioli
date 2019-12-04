import { Operation } from './lib/JSONPatch'

export type IObservable = {
  $id: string
  $isObservable: true
  $patch: Operation[]
  $transactionDidEnd(): void
}
