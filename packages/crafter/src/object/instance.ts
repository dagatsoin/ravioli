import {
  fail,
  getChildKey,
  toInstance,
  getSnapshot,
  toNode,
  isOwnLeafPath,
  unbox,
  getRoot,
  getTargetKey,
  makePath,
} from '../helpers'
import { computeNextState } from '../lib/computeNextState'
import { IInstance } from '../lib/IInstance'
import { DataObject, INodeInstance } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import { BasicCommand, Command, ReplaceCommand, Migration, isShapeMutationCommand, Operation } from '../lib/JSONPatch'
import {
  add,
  createAddMigration,
  createCopyMigration,
  createMoveMigration,
  createRemoveMigration,
  createReplaceMigration,
  copy,
  move,
  remove
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { setNonEnumerable, mergeMigrations } from '../utils/utils'

import { ObjectFactoryInput, ObjectFactoryOutput, object } from './factory'
import { Props } from './Props'
import { ObjectType } from './type'
import { ReferenceValue, isReferenceType } from '../lib/reference'
import { IContainer } from '../IContainer'
import { isIdentifierType } from '../identifier'
import { Computed } from '../observer'
import { getTypeFromValue } from '../lib/getTypeFromValue'
import { isNode } from '../lib/isNode'
import { MapInstance } from '../map/instance'
import { ArrayInstance } from '../array/instance'

/**
 * Data flow
 * prop setter => present replace migration => $applycommand => $setValue on each child
 * $setValue => split in child command replacement => present replace migration ...
 * 
 * For a node, $setValue won't affect anything byt will delegate each chunk of value to its children
 */

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
    this.$attachChildren()
  }

  public $kill(): void {
    super.$kill()
    // Kill children ><'
    Object.keys(this.$type.properties).forEach(prop => {
      this.$data[prop].$kill()
    })
  }

  public $setValue(value: INPUT): boolean {
    if (!this.$$container.isWrittable) {
      throw new Error(
        'Crafter object. Tried to set an object value while model is locked.'
      )
    }

    // Special case, affecting new value to a Computed
    // may need to reshape the type.
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

      // Change the value for the rest of the keys
      return valueKeys
        .filter(key => !missingKeys.includes(key)) // just added above
        .filter(key => !!value[key]) // exclude undefined value field
        .reduce(
          (didChildrenChange: boolean, key) => (
            toInstance(this.$data[key]).$setValue(value[key]) && didChildrenChange ||
            !!missingKeys.length // Anayway, new keys has been added, so there is some changes
          ),
          false
        )
        
      
    } else {
      let didChange = false

      for (const key in this.$data) {
        didChange = this.$data[key].$setValue(value[key as any]) && didChange
      }
      return didChange 
    }
  }

 /*  public $applyCommand = <O extends Command>(
    command: O & BasicCommand,
    shouldEmitPatch: boolean = false
  ): void => {
    const childKey = getChildKey(this.$path, command.path)
    // Apply command on this object
    if (
      isOwnLeafPath(this.$path, command.path) &&
      command.op === 'replace' &&
      childKey
    ) {
      this.replace<O>(shouldEmitPatch, childKey, command)
    }
    // Or delegate to children
    else if (command.path.includes(this.$path) && childKey) {
      // Get the concerned child key
      toNode(
        toInstance(this.$data[childKey])
      ).$applyCommand(command, shouldEmitPatch)
    }
  } */
  
/**
 * Accept the value if the model is writtable
 */
public $present(proposal: Proposal, shouldAddMigration: boolean): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!this.$$container.isWrittable) {
    fail(`Crafter Object. Tried to mutate an object while model is locked.`)
    return
  }
  
  const proposalMigration: Migration<any, any> = {
    forward: [],
    backward: []
  }

  for(const command of proposal) {

    const childKey = getChildKey(this.$path, command.path)

    if (!childKey) {
      continue
    }

    // Replace the entire value
    if(command.path === this.$path) {
      if (command.op === Operation.replace) {
        const didChange = this.$setValue(command.value)
        if (didChange) {
          mergeMigrations(createReplaceMigration(command, {replaced: this.$snapshot}), proposalMigration)            
        }
      }
    }
    else if (isOwnLeafPath(this.$path, command.path)) {
      if (command.op === Operation.replace) {
        const didChange =  this.$data[childKey as keyof this["$data"]].$setValue(command.value)
        if (didChange) {
          mergeMigrations(createReplaceMigration(command, {replaced: this.$snapshot}), proposalMigration)            
        }
      } else if (command.op === 'remove') {
        const changes = remove(this, getObjectKey(this, command))
        if (changes) {
          mergeMigrations(createRemoveMigration(command, changes), proposalMigration)
        }
      } else if (command.op === 'add') {
        const index = getObjectKey(this, command)
        // Is an alias of replace
        if (this.$data[index] !== undefined) {
          throw new Error('not implemented yet')
  //        present(model, [{ ...command, op: 'replace' }])
        } else {
          add(this, command.value, index)
       /*    if (willEmitPatch) {
            addAddPatch(model, command)
          } */
        }
      } else if (command.op === 'copy') {
        const changes = copy(this, command)
        if (changes) {
          mergeMigrations(createCopyMigration(command, changes), proposalMigration)
        }
      } else if (command.op === 'move') {
        const changes = move(this, command)
        if (changes) {
          mergeMigrations(createMoveMigration(command, changes), proposalMigration)
        }
      } else {
        throw new Error(`Crafter Array.$applyOperation: ${
          (proposal as any).op
        } is not a supported command. This error happened
          during a migration command. The transaction is cancelled and the model is reset to its previous value.`)
      }
    }
    // Or delegate to children
    else if (command.path.includes(this.$path)) {
      // Get the concerned child key
      toNode(
        toInstance(this.$data[childKey])
      ).$present(command, shouldEmitPatch)
    }
  }

  // Those commands update the shape of the model
  if (proposalMigration.forward.some(isShapeMutationCommand)) {
    this.$$container.addUpdatedObservable(this)
  } if (shouldAddMigration) {
    this.$addMigration(proposalMigration)
  }
}

  public $addInterceptor(index: string): void {
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
      ? this.$$id
      : isInstance(item)
        ? getSnapshot(item)
        : item

    return this.$type.properties[key].create(
      value,
      { context: this.$$container }
    ) as any
  }

  private $attachChildren() {
    const keys = Object.keys(this.$type.properties)
    for (const key of keys) {
      toInstance(this.$data[key]).$attach(this, key)
    }
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

function build(obj: ObjectInstance<any, any, any, any>, value = {}): void {
  obj.$$container.transaction(function() {
    Object.keys(obj.$type.properties).forEach(function(key) {
      // Computed value: bind it to the object
      if (obj.$type.properties[key] instanceof Computed) {
        Object.defineProperty(obj, key, {
          get() {
            return obj.$type.properties[key].get(obj)
          },
          enumerable: true,
          configurable: true,
        })
      }
      else {
        present(obj, [
          { op: 'add', path: makePath(obj.$path, key), value: value[key] },
        ])
      }
    })
  })
}

function addPropGetSet(
  obj: ObjectInstance<any, any, any, any>,
  propName: string
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
          // Notify the read of the child node
          if (isNode(instance)) {
            instance.$$container.notifyRead(instance, makePath(getRoot(instance).$id, instance.$path))
          }
          // return the instance if it is a node or the value if it is a leaf
          return unbox(instance)
        }
      },
      set(value: any) {
        // If the value is an object, cut it down in atomic JSON command
        const needToCutDown = isObject(value)
        if (needToCutDown) {
          present(obj, [{ op: 'replace', value: value instanceof Map ? Array.from(value.entries()) : value, path: makePath(obj.$path, propName) }])
    //      const proposal = cutDownUpdateOperation(value, makePath(propName.toString()) )
    //      present(obj, proposal)
        } else {
          present(obj, [{ op: 'replace', value: value instanceof Map ? Array.from(value.entries()) : value, path: makePath(obj.$path, propName) }])
        }
      },
      enumerable: true,
      configurable: true,
    })
  }
}

function isObject(thing: any): thing is object {
  return !(thing instanceof Map) && !Array.isArray(thing) && typeof thing === "object"
}

export function cutDownUpdateOperation(value: object, opPath: string): Proposal {
  return Object
    .keys(value)
    .map(key => ({
      op: Operation.replace,
      path: makePath(opPath, key),
      value: value[key]
    }))
}

type Proposal = BasicCommand[]

/**
 * Accept the value if the model is writtable
 */
function present(
  model: ObjectInstance<any, any, any, any>,
  proposal: Proposal
): void {
  // No direct manipulation. Mutations must occure only during a transaction.
  if (!model.$$container.isWrittable) {
    fail(`Crafter Object. Tried to mutate an object while model is locked.`)
    return
  }
  
  const proposalMigration: Migration<any, any> = {
    forward: [],
    backward: []
  }

  proposal.forEach(command => {

    const childKey = getChildKey(model.$path, command.path)
    // Apply command on model object
    if (
      isOwnLeafPath(model.$path, command.path) &&
      command.op === 'replace' &&
      childKey
    ) {
      model.replace<O>(shouldEmitPatch, childKey, command)
    }
    // Or delegate to children
    else if (command.path.includes(model.$path) && childKey) {
      // Get the concerned child key
      toNode(
        toInstance(model.$data[childKey])
      ).$present(command, shouldEmitPatch)
    }


    if (command.op === 'replace') {
      model.$present(command, true)
    } else if (command.op === 'remove') {
      const changes = remove(model, getObjectKey(model, command))
      if (changes) {
        mergeMigrations(createRemoveMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'add') {
      const index = getObjectKey(model, command)
      // Is an alias of replace
      if (model.$data[index] !== undefined) {
        throw new Error('not implemented yet')
//        present(model, [{ ...command, op: 'replace' }])
      } else {
        add(model, command.value, index)
     /*    if (willEmitPatch) {
          addAddPatch(model, command)
        } */
      }
    } else if (command.op === 'copy') {
      const changes = copy(model, command)
      if (changes) {
        mergeMigrations(createCopyMigration(command, changes), proposalMigration)
      }
    } else if (command.op === 'move') {
      const changes = move(model, command)
      if (changes) {
        mergeMigrations(createMoveMigration(command, changes), proposalMigration)
      }
    } else {
      throw new Error(`Crafter Array.$applyOperation: ${
        (proposal as any).op
      } is not a supported command. This error happened
        during a migration command. The transaction is cancelled and the model is reset to its previous value.`)
    }
  })

  // Those commands update the shape of the model
  if (proposalMigration.forward.some(isShapeMutationCommand)) {
    model.$$container.addUpdatedObservable(model)
  }
  model.$addMigration(proposalMigration)
}

function getObjectKey(model: INodeInstance<any>, op: BasicCommand): string {
  const index = String(getChildKey(model.$path, op.path))
  if (!isValidObjectIndex(model, index, op)) {
    throw new Error(`Crafter ${index} is not a property of the object instance.`)
  }
  return index
}

/**
 * Return true if the string is a valid Object or Map index.
 */
function isValidObjectIndex(
  model: INodeInstance<any>,
  index: string,
  proposal: BasicCommand
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
