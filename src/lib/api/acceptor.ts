import { ArrayType, ToLiteral } from "./helpers.type";

type Condition<M, P> = (modelData: M, payload: P) => boolean;

export type Acceptor<M, P> = {
  condition?: Condition<M, P>;
  mutator: Mutator<M, P>;
};

type Payload = {
  [key: string]: any;
};

export type Mutation<T extends string, P extends Payload> = P extends
  | never
  | undefined
  ? {
      type: ToLiteral<T>;
      payload?: undefined; // trick to be able to write mutation without payload but
      // prevent lint error when accessing it in generic function (eg. present function)
    }
  : {
      type: ToLiteral<T>; // this transforms the passed string in a literal.
      payload: P;
    };

export type Mutator<M, P> = (model: M, payload: P) => void;

// Helper type. Extract all mutations names.
export type MutationName<F extends Mutation<any, any>> = F["type"];

export type MapToProposal<
  M extends Record<string, Acceptor<any, any>>
> = {
  [K in keyof M]: {
    type: K;
    payload: ArrayType<Parameters<M[K]["mutator"]>>;
  };
};
