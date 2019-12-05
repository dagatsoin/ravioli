import { InstanceFromValue } from "../InstanceFromValue";
import { INodeInstance } from './INodeInstance';
import { IInstanceContainer } from "./container/IInstanceContainer";
export function isNode<T>(value: any): value is InstanceFromValue<T> {
  return ((((value as unknown) as INodeInstance<T>).$isNode && !isContainer(value)) ||
    (isContainer(value) && isNode(value.$targetInstance)));
}

export function isContainer<T>(
  value: any
): value is IInstanceContainer<T> {
  return (value as IInstanceContainer<T>)?.$isContainer === true
}

