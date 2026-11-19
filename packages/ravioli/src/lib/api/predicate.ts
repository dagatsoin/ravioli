import { Mutation } from "./acceptor";

export type Predicate<
  MODEL,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES extends string,
  LEAF
> = PredicateFunction<MODEL, MUTATIONS, CONTROL_STATES> | PredicateTree<LEAF>;

export type CSPredicate<
  MODEL,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES extends string = never
> = Predicate<
  MODEL,
  MUTATIONS,
  CONTROL_STATES,
  CONTROL_STATES | { previous: CONTROL_STATES }
>;

type PredicateFunction<
  T,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES = string
> = (args: {
  data: T;
  previousControlStates: CONTROL_STATES[];
  acceptedMutations: MUTATIONS[];
}) => boolean;

type PredicateTree<Leaf> = BooleanNode<Leaf>;

type BooleanNode<BooleanLeaf> =
  | BooleanLeaf
  | { and: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { or: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { not: BooleanNode<BooleanLeaf> };
