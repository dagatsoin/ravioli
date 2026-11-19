import { IObservableArray } from "mobx";
import { Mutation } from "./acceptor";
import { Predicate } from "./predicate";

export type Transformation<MODEL, CONTROL_STATES> = ({
  data, controlStates
}: {data: MODEL, controlStates: IObservableArray<CONTROL_STATES>}) => any;

/**
 * A static representation is only computed once at the container creation.
 * During the computation, the model data are injected and is bound to the returned value.
 * Its purposes is to enable model abstraction with a set of accessors. For example some React hooks.
 * It performs way better than classic transformation as it is only computed once. Plus it has access to the instance actions.
 */
export type StaticTransformation<MODEL, ACTIONS> = ({ data }: {data: MODEL, actions: ACTIONS }) => any;

/**
 * @deprecated Nothing uses it, and it has no replacement. It is removed in
 * the next major version.
 */
export type RepresentationPredicate<
  MODEL,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES extends string
> = Predicate<MODEL, MUTATIONS, CONTROL_STATES, CONTROL_STATES>;
