import { IFactory } from '../lib/IFactory'

export type Props<T> = {
  [K in keyof T]: IFactory<T[K]> | IFactory<T[K], string>
}
