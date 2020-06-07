import { IObservable } from '../IObservable';
import { Migration } from '../lib/JSONPatch';

export interface IComputed<T> extends IObservable {
  id: string
  $migration: Migration
  get(): T
}
