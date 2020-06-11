import { Migration } from '../lib/JSONPatch';
import { IObserver } from './Observer';

export interface IComputed<T> extends IObserver {
  id: string
  migration: Migration
  get(): T
}
