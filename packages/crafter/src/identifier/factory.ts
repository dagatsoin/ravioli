import { IdentifierType } from "./type"
import { IFactory } from "../lib/IFactory"

export function identifier(): IFactory<string> {
  return new IdentifierType<string>()
}