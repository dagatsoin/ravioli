import { IInstance } from '../IInstance';
export interface IInstanceContainer<T> {
  $targetInstance: IInstance<T>;
  $isContainer: true;
}
