import { IObservableArray } from "mobx";
import { Mutation } from "./acceptor";
import { Predicate } from "./predicate";

export type Transformation<TYPE, CONTROL_STATES> = ({
  model, controlStates
}: {model: TYPE, controlStates: IObservableArray<CONTROL_STATES>}) => any;

/**
 * A static representation is only computed once at the container creation.
 * During the computation, the model is injected and is bound to the returned value.
 * Its purposes is too enable model abstraction with a set of accessors. For example
 * some React hooks.
 * It performs way better than classic transformation as it is only computed once.
 */
export type StaticTransformation<TYPE> = ({ model }: {model: TYPE }) => any;

export type RepresentationPredicate<
  TYPE,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES extends string
> = Predicate<TYPE, MUTATION, CONTROL_STATES, CONTROL_STATES>;
