import { IType } from "../lib/IType"
import { Instance } from "../lib/Instance"
import { IContainer } from "../IContainer"
import { setNonEnumerable } from '../utils/utils'
import { Command } from '../lib/JSONPatch'
import { fail, warn } from '../helpers'


export class IdentifierInstance<T extends string> extends Instance<T, T> {
  public $data: any
  public $type: IType<T>
  constructor({
    type,
    value,
    context
  }: {
    type: IType<T>
    value: T
    context?: IContainer
  }) {
    super((data) => data, context)
    // Counter intuitively we do not validate the uniqness of the id, as it is already
    // used by the parent caller.
    this.$type = type
    this.$$id = this.$$container.getUID('Instance#')
    this.$$container.useUID(this.$$id)
    this.$data = value
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
  //  setNonEnumerable(this, '$setValue')
  }
  public get $snapshot(): T {
    return this.$data
  }
  public get $value(): T {
    return this.$data
  }
  public get $id(): string {
    return this.$$id
  }
  public $present(proposal: Command[]): void {
    fail(`[CRAFTER] Identifier: attempt to present a proposal to an identifier.`)
  }
  // Implementation will be chosen by the constructor
  public $setValue(v: T): void {
    if (v !== this.$$id) {
      throw new Error (`[CRAFTER] Identifier: attempt to mutate an identifier.`)
    }
  }
}