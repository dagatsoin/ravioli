import { Operation } from 'fast-json-patch'

export type Condition<P> = (payload: P) => boolean

export type Acceptor<P> = {
  condition?: Condition<P>
  mutator: Mutator<P>
}

export type Acceptors<P> = {
  [key: string]: Acceptor<P>
}

export type Mutation<T, P> = {
  type: T
  payload?: P
}

export type MutationResult<T> = {
  operation: Operation
  data: T
}

export type Mutator<P = any> = (payload: P) => void

export function isLeafMutation(mutation: Mutation<any, any>): boolean {
  return true
}
