import { IInstance } from "./IInstance";

export interface IWithParent {
  readonly $path: string
  $parentKey: string | number | undefined
  $parent: IInstance<any> | undefined
  $attach(parent: IInstance<any>, key: number | string): void
  $detach(): void
}