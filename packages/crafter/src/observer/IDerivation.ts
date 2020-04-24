import { IObservable } from '../IObservable';
import { Migration } from '../lib/JSONPatch';

export interface IComputed<T> extends IObservable {
  $migration: Migration
  get(): T
}
