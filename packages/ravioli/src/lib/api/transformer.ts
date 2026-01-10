import { IObservableArray } from "mobx";
import { Mutation } from "./acceptor";
import { Predicate } from "./predicate";

export type Transformation<TYPE, CONTROL_STATES> = ({
  data, controlStates
}: {data: TYPE, controlStates: IObservableArray<CONTROL_STATES>}) => any;

/**
 * A static representation is only computed once at the container creation.
 * During the computation, the model data are injected and is bound to the returned value.
 * Its purposes is to enable model abstraction with a set of accessors. For example some React hooks.
 * It performs way better than classic transformation as it is only computed once. Plus it has access to the instance actions.
 */
export type StaticTransformation<TYPE, ACTIONS> = ({ data }: {data: TYPE, actions: ACTIONS }) => any;

export type RepresentationPredicate<
  TYPE,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES extends string
> = Predicate<TYPE, MUTATION, CONTROL_STATES, CONTROL_STATES>;
