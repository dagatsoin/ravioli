import {
  getChildKey,
  toInstance,
  getSnapshot,
  toNode,
  isOwnLeafPath,
  unbox,
  getRoot,
} from '../helpers'
import { computeNextState } from '../lib/computeNextState'
import { IInstance } from '../lib/IInstance'
import { DataObject, INodeInstance } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import { BasicOperation, Operation } from '../lib/JSONPatch'
import {
  add,
  addAddPatch,
  addCopyPatch,
  addMovePatch,
  addRemovePatch,
  addReplacePatch,
  copy,
  move,
  remove,
  replace,
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { setNonEnumerable } from '../utils/utils'

import { ObjectFactoryInput, ObjectFactoryOutput } from './factory'
import { Props } from './Props'
import { ObjectType } from './type'
import { ReferenceValue, isReferenceType } from '../lib/reference'
import { IContainer } from '../IContainer'
import { isIdentifierType } from '../identifier'
import { Computed } from '../observer'
import { getTypeFromValue } from '../lib/getTypeFromValue'

export class ObjectInstance<
  TYPE extends {},
  PROPS extends Props<TYPE>,
  OUTPUT extends ObjectFactoryOutput<PROPS>,
  INPUT extends ObjectFactoryInput<PROPS>
> extends NodeInstance<OUTPUT, INPUT> {
  public $data: DataObject<OUTPUT> = {} as DataObject<OUTPUT>
  public $type: ObjectType<TYPE, PROPS, OUTPUT, INPUT>
  private identifierKey?: string

  constructor({
    type,
    value,
    options
  }: {
    type: ObjectType<TYPE, PROPS, OUTPUT, INPUT>
    value?: INPUT | ReferenceValue
    options?: {
      id?: string
      context?: IContainer
    }
  }) {
    // Implementation notes about the UID
    // As object can have an identifier field, we need to cover several cases:
    // 1. The object has an identifier field
    //   1.1 The object value contains the value of the identifier in the field
    //       - Set the object UID with the identifier field value
    //       - At build, set identifier field with the same UID
    //   1.2 the object value does not contain the value of the identifier field
    //       - Set a new UID to the object instance (done in Instance class)
    //       - At build, set the identifier field value with the object UID.
    // 2. the object has not an identifier field
    //    - Set a new UID to the object instance (done in Instance class)
    //
    // Also note that the IdentifierInstance $$id is not the same as its value.
    // $$id being an UID, the value being the $$id of the parent object.
    super(
      generateSnapshot,
      generateValue,
      ['$identifierKey'],
      {
        context: options?.context,
        id: getId({
          value,
          id: options?.id,
          identifierKey: getIdentfierKey(type)
        })
      })
    this.$type = type
    this.$identifierKey = getIdentfierKey(this.$type)
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    build(this, value)
    this.$computeSnapshot()
  }

  public $attach(parent: INodeInstance<any>, key: string): void {
    super.$attach(parent, key)
  }

  public $kill(): void {
    super.$kill()
    // Kill children ><'
    Object.keys(this.$type.properties).forEach(prop => {
      this.$data[prop].$kill()
    })
  }

  public $setValue(value: INPUT): void {
    if (!this.$$container.isWrittable) {
      throw new Error(
        'Crafter object. Tried to set an object value while model is locked.'
      )
    }
    // Special case, affecting new value to a Computed
    // may need to reshape the type.
    // Also, as this is an internal Computed operation
    // this won't emit patch
    if (this.$$container.isRunningReaction) {
      const valueKeys = Object.keys(value)
      const propsKeys = Object.keys(this.$type.properties)

      const isNowDead = (pk: string): boolean =>
        // Value does not contains this key
        !valueKeys.includes(pk) ||
        // This value field is now undefined
        value[pk] === undefined && this.$data[pk] !== undefined

      // Sync props
      const propsToRemove = propsKeys.filter(isNowDead)
      const missingKeys = valueKeys
        .filter(vk => value[vk] !== undefined)
        .filter(vk => !propsKeys.includes(vk))

      // Delete dead properties
      propsToRemove.forEach(key => {
        this.$data[key].$kill()
        delete this.$data[key]
        delete this.$type.properties[key]
      })
      
      // Add new props
      missingKeys.forEach(key => {
        this.$type.properties[key] = getTypeFromValue(value[key], true) // always use strict mode
        add(this as any, value[key], key)
      })

      valueKeys
        .filter(key => !!value[key]) // exlucde undefined value field
        .forEach(key => {
          this.$data[key].$setValue(value[key])
        })
    } else {
      Object.keys(this.$data).forEach(key =>
        this.$data[key].$setValue(value[key])
      )
    }
  }

  public $applyOperation = <O extends Operation>(
    operation: O & BasicOperation,
    willEmitPatch: boolean = false
  ): void => {
    const childKey = getChildKey(this.$path, operation.path)
    // Apply operation on this object
    if (
      isOwnLeafPath(this.$path, operation.path) &&
      operation.op === 'replace'
    ) {
      let backup
      if (willEmitPatch) {
         backup = this.$data[childKey].$value
      }
      // Apply the operation to the child key
      this.$data[childKey].$setValue(
        operation.value
      )
      if (willEmitPatch) {
        this.$$container.addUpdatedObservable(this)
        addReplacePatch(this as any, operation, {replaced: backup})
      }
    }
    // Or delegate to children
    else if (operation.path.includes(this.$path)) {
      // Get the concerned child key
      toNode(
        toInstance(this.$data[childKey])
      ).$applyOperation(operation, willEmitPatch)
    }
  }
  public $addInterceptor(index: string | number): void {
    addPropGetSet(this, index)
  }

  public $createChildInstance<I, K extends keyof PROPS>(
    item: I,
    key: K
  ): IInstance<I> {
    if (isInstance(item)) {
      // @todo: remove when ref will be implemented
      // tslint:disable-next-line: no-console
      console.warn(
        'Crafter $createChildInstance does not support IInstance yet, this will be copy.'
      )
    }
    // Special case: identifier field
    // If no value is present, set the value to the $$id of the model
    const value = this.$identifierKey === key
      ? item[key as string] || this.$$id
      : isInstance(item[key as string])
        ? getSnapshot(item[key as string])
        : item[key as string]

    return this.$type.properties[key].create(
      value,
      { context: this.$$container }
    ) as any
  }
}

function generateSnapshot<T>(data: DataObject<T>): T {
  const snapshot = {} as T
  for (const key in data) {
    snapshot[key] = data[key].$snapshot
  }
  return snapshot
}

function generateValue<T>(data: DataObject<T>): T {
  const value = {} as T
  for (const key in data) {
    value[key] = data[key].$value
  }
  return value
}

function build(object: ObjectInstance<any, any, any, any>, value = {}): void {
  object.$$container.transaction(function() {
    Object.keys(object.$type.properties).forEach(function(key) {
      // Computed value: bind it to the object
      if (object.$type.properties[key] instanceof Computed) {
        Object.defineProperty(object, key, {
          get() {
         //   object.$$container.addObservedPath(getRoot(object).$id + object.$path + '/' + key)
            return object.$type.properties[key].get(object)
          },
          enumerable: true,
          configurable: true,
        })
      }
      else {
        present(object, [
          { op: 'add', path: object.$path + '/' + key, value: value ?? [key] },
        ])
      }
    })
  })
}

function addPropGetSet(
  obj: ObjectInstance<any, any, any, any>,
  propName: string | number
): void {
  if (isReferenceType(obj.$type.properties[propName])) {
    Object.defineProperty(obj, propName, {
      get() {
        const instance = obj.$$container.getReferenceTarget(
          obj.$data[propName].$value
        )
        // return the instance if it is a node or the value if it is a leaf
        return instance
      },
      set(value: any) {
        obj.$$container.getReferenceTarget(obj.$data[propName].$value).$setValue(
          value
        )
      },
      enumerable: true,
      configurable: true,
    })
  } else {
    Object.defineProperty(obj, propName, {
      get() {
        const instance = obj.$data[propName]
        // This check is required in case the object has moving shape (case of Computed)
        if (instance) {
          obj.$$container.addObservedPath(getRoot(obj).$id + obj.$path + '/' + propName)
          // return the instance if it is a node or the value if it is a leaf
          return unbox(instance, obj.$$container)
        } else {
          return undefined
        }
      },
      set(value: any) {
        present(obj, [
          { op: 'replace', value, path: obj.$path + '/' + propName },
        ])
      },
      enumerable: true,
      configurable: true,
    })
  }
}

type Proposal = BasicOperation

/**
 * Accept the value if the model is writtable
 */
function present<T>(
  model: INodeInstance<T>,
  proposal: Proposal[],
  willEmitPatch: boolean = true
): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!model.$$container.isWrittable) {
    throw new Error(
      `Crafter Object. Tried to mutate an object while model is locked.`
    )
  }
  proposal.forEach(command => {
    if (command.op === 'replace') {
      const changes = replace(
        model,
        command.value,
        getObjectKey(model, command)
      )
      if (willEmitPatch) {
        addReplacePatch(model, command, changes)
      }
    } else if (command.op === 'remove') {
      const changes = remove(model, getObjectKey(model, command))
      if (willEmitPatch) {
        addRemovePatch(model, command, changes)
      }
    } else if (command.op === 'add') {
      const index = getObjectKey(model, command)
      // Is an alias of replace
      if (model.$data[index] !== undefined) {
        present(model, [{ ...command, op: 'replace' }])
      } else {
        add(model, command.value, index)
        if (willEmitPatch) {
          addAddPatch(model, command)
        }
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      if (willEmitPatch) {
        addCopyPatch(model, command, changes)
      }
    } else if (command.op === 'move') {
      const changes = move(model, command)
      if (willEmitPatch) {
        addMovePatch(model, command, changes)
      }
    } else {
      throw new Error(`Crafter Array.$applyOperation: ${
        (proposal as any).op
      } is not a supported operation. This error happened
        during a patch operation. The transaction is cancelled and the model is reset to its previous value.`)
    }
  })

  computeNextState(model)
}

function getObjectKey(model: INodeInstance<any>, proposal: Proposal): string {
  const index = String(getChildKey(model.$path, proposal.path))
  if (!isValidObjectIndex(model, index, proposal)) {
    throw new Error(`Crafter ${index} is not a valid array index.`)
  }
  return index
}

/**
 * Return true if the string is a valid Object or Map index.
 */
function isValidObjectIndex(
  model: INodeInstance<any>,
  index: string,
  proposal: BasicOperation
): boolean {
  // property starting with $ is reserved for internal used
  return (
    index[0] !== '$' &&
    // other command than add must lead to an existing index
    (proposal.op !== 'add'
      ? index in model // check if the key exists, not if there is a value (undefined is a valid value)
      : true)
  )
}

function getIdentfierKey(type: ObjectType<any, any, any, any>): string | undefined {
  return Object.keys(type.properties).find(key => {
    const prop = type.properties[key]
    return isIdentifierType(prop)
  })
}

function getId({
  value,
  id,
  identifierKey,
}: {
  value?: any
  id?: string
  identifierKey?: string
}): string | undefined {
  if (id) {
    return id
  } else {
    if (value && identifierKey) {
      return value[identifierKey]
    }
  }
}
