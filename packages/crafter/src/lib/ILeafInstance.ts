import { IInstance } from "./IInstance";

export interface ILeafInstance<T> extends IInstance<T> {
  $isLeaf: true
}