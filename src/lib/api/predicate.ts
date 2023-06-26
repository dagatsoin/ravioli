import { Mutation } from "./acceptor";

export type Predicate<
  TYPE,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES extends string,
  LEAF
> = PredicateFunction<TYPE, MUTATION, CONTROL_STATES> | PredicateTree<LEAF>;

export type CSPredicate<
  TYPE,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES extends string = never
> = Predicate<
  TYPE,
  MUTATIONS,
  CONTROL_STATES,
  CONTROL_STATES | { previous: CONTROL_STATES }
>;

type PredicateFunction<
  T,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES = string
> = (args: {
  data: T;
  previousControlStates: CONTROL_STATES[];
  acceptedMutations: MUTATION[];
}) => boolean;

type PredicateTree<Leaf> = BooleanNode<Leaf>;

type BooleanNode<BooleanLeaf> =
  | BooleanLeaf
  | { and: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { or: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { not: BooleanNode<BooleanLeaf> };
