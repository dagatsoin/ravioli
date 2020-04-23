import { IObservable } from '../IObservable';
export interface IDerivation<T> extends IObservable {
  get(): T;
}
