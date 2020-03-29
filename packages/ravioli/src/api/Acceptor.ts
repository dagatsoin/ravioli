import { Payload } from './shared'
import { ToLiteral } from '@warfog/crafter'

type Condition<P> = (payload: P) => boolean

export type Acceptor<P> = {
  condition?: Condition<P>
  mutator: Mutator<P>
}

export type Mutation<T extends string, P extends Payload> = P extends
  | never
  | undefined
  ? {
      type: ToLiteral<T>
      payload?: undefined // trick to be able to write mutation without payload but
      // prevent lint error when accessing it in generic function (eg. present function)
    }
  : {
      type: ToLiteral<T> // this transforms the passed string in a literal.
      payload: P
    }

export type Mutator<P> = (payload: P) => void
