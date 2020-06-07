import { InstanceFromValue } from "../InstanceFromValue";
import { IInstanceContainer } from "./container/IInstanceContainer";
import { isUnknownType } from "../Primitive";
//import { isUnionType } from "../union/type";
import { isNodeType } from "./NodeType";
import { IType } from "./IType";

export function isNode<T>(value: any): value is InstanceFromValue<T> {
   return (
    value.$isNode && !isContainer(value) // is a node
  )/*  || (
    isContainer(value) && (
      isNode(value.$targetInstance) ||  // is node container
      isUnknownType(value.$targetInstance.$type)  // is a container of an unknown type
    )
  ) || (
    isUnionType(value.$type) && (
      value.$type.types.some((type: IType<any>) => (
        isNodeType(type) || // is a union including an node type
        isUnknownType(type) // is a union including an unknown type
      ))
    )
  ) */
}

export function isContainer<T>(
  value: any
): value is IInstanceContainer<T> {
  return (value as IInstanceContainer<T>)?.$isContainer === true
}

