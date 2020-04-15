import { IInstance } from "./IInstance";
import { IWithParent } from "./IWithParent";

export interface ILeafInstance<T> extends IInstance<T>, IWithParent{
  $isLeaf: true
}