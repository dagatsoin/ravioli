import { IFactory } from './IFactory'
import { InputValidator } from './TypeChecker'
import { IInstance } from './IInstance'

export interface IType<TYPE, SNAPSHOT = TYPE> extends IFactory<TYPE, SNAPSHOT> {
  Type: TYPE
  Snapshot: SNAPSHOT
  /**
   * Validate a snapshot value against a Type.
   */
  isValidSnapshot: InputValidator<SNAPSHOT>
  /**
   * Validate a value against a Type.
   * Same as isValidSnapshot but accepts a mix of snapshot and instance.
   */
  isValidValue: InputValidator<SNAPSHOT>
  getSnapshot(instance: IInstance<TYPE, SNAPSHOT>): SNAPSHOT
  applySnapshot(instance: IInstance<TYPE, SNAPSHOT>, snapshot: SNAPSHOT): void
}

export type ExtractTypes<T extends any[]> = T extends (infer U)[]
  ? U extends IType<any>
    ? U['Type']
    : never
  : never

export type InferSubType<T> = T extends (infer U)[]
  ? IType<U>
  : T extends Map<any, infer M>
  ? IType<M>
  : never
