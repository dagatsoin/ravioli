import { Migration } from '../lib/JSONPatch';
import { IObserver } from "./IObserver";

export interface IDerivation<T> extends IObserver {
  id: string
 // migration: Migration
  get(): T
}
