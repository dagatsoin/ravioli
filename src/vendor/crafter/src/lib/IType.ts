import { IInstance } from './IInstance'
import { Snapshot } from "./Snapshot"
import { TypeChecker } from './TypeChecker'

export interface IType<T, S extends Snapshot<T> = Snapshot<T>> {
  Type: T
  isValidValue: TypeChecker<T>
  create(value?: S | IInstance<T>, id?: string): T
}

export type ExtractTypes<T extends any[]> = T extends Array<infer U>
  ? U extends IType<any>
    ? U['Type']
    : never
  : never
