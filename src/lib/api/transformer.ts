import { IObservableArray } from "mobx";
import { Mutation } from "./acceptor";
import { Predicate } from "./predicate";

export type Transformation<TYPE, CONTROL_STATES> = ({
  data, controlStates
}: {data: TYPE, controlStates: IObservableArray<CONTROL_STATES>}) => any;
export type RepresentationPredicate<
  TYPE,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES extends string
> = Predicate<TYPE, MUTATION, CONTROL_STATES, CONTROL_STATES>;
