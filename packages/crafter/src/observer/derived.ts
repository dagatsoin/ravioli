import { IObservable } from '../IObservable';
import { IDerivation } from './IDerivation';
import { ComputedOptions, Derivation } from './Derivation';


export function derived<T>(fun: (boundThis?: IObservable) => T, options?: ComputedOptions): IDerivation<T> {
  return new Derivation(fun, options);
}
