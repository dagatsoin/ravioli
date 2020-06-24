import {
  fail,
  getChildKey,
  toInstance,
  getSnapshot,
  toNode,
  unbox,
  getRoot,
  makePath,
  isGrandChildPath,
  warn,
} from '../helpers'
import {
  IInstance,
  ProposalResult,
  CommandResult,
} from '../lib/IInstance'
import { DataObject, INodeInstance } from '../lib/INodeInstance'
import { isInstance } from '../lib/Instance'
import {
  BasicCommand,
  isShapeMutationOperation,
  Operation,
  Command,
  Migration,
} from '../lib/JSONPatch'
import {
  createCopyMigration,
  createMoveMigration,
  createRemoveMigration,
  createReplaceMigration,
  copy,
  move,
  remove,
  createAddMigration,
} from '../lib/mutators'
import { NodeInstance } from '../lib/NodeInstance'
import { setNonEnumerable } from '../utils/utils'

import { ObjectFactoryInput, ObjectFactoryOutput } from './factory'
import { Props } from './Props'
import { ObjectType } from './type'
import { ReferenceValue, isReferenceType } from '../lib/reference'
import { IContainer, Proposal } from '../IContainer'
import { isIdentifierType } from '../identifier'
import { isDerivation } from '../observer'
import { isNode } from '../lib/isNode'
import { getTypeFromValue } from '../lib/getTypeFromValue'

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
  public $type: ObjectType<TYPE, PROPS, OUTPUT, INPUT>
  //public $data: DataObject<OUTPUT> = {} as DataObject<OUTPUT>
  public $data: any = {}
  private identifierKey?: string

  constructor({
    type,
    value,
    options,
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
    super(generateSnapshot, generateValue, ['$identifierKey'], {
      context: options?.context,
      id: getId({
        value,
        id: options?.id,
        identifierKey: getIdentfierKey(type),
      }),
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
  /* public $applyCommand = <O extends Command>(
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

  public $setValue(value: TYPE, addMigration: boolean) {
    this.$present(
      [{ op: Operation.replace, value, path: this.$path }],
      addMigration
    )
  }

  /**
   * Accept the value if the model is writtable
   */
  public $present(proposal: Proposal, addMigration = true): void {
    // No direct manipulation. Mutations must occure only during a transaction.
    if (!this.$$container.isWrittable) {
      fail(`Crafter Object. Tried to mutate an object while model is locked.`)
      return
    }

    // Track if each command has been accepted or rejected.
    // It will be used by the next state function to generated the migration.
    const proposalResult: ProposalResult = []

    for (const command of proposal) {
      // The command target a grand children, pass down.
      /* if (isGrandChildPath(command.path, this.$path)) {
        const childKey = getChildKey<TYPE>(this.$path, command.path)
        if (!childKey) {
          continue
        }
        toNode(toInstance(this.$data[childKey])).$present(
          [command],
          addMigration
        )
      }
      // Replace the entire value
      else */ if (command.op === Operation.replace) {
        // The replace command targets this node
        const isNodeReplacement = command.path === this.$path
        const isRoot = this.$path === '/'
        /*        const isForRoot = childKey === undefined && command.path.endsWith('/')

        // Not childkey available
         if (!isForRoot && childKey === undefined) {
          continue
        }
 */

        if (isNodeReplacement) {
          // Track if children has accepted the whole proposal.
          let accepted = false
          const snapshot = this.$createNewSnapshot()

          cutDownUpdateOperation(command.value, command.path).forEach(
            subCommand => {
              const childKey = getChildKey<TYPE>(this.$path, subCommand.path)
              // Edge case, the instance has been removed from a previous command and can be undefined.
              const instance: IInstance<any> | undefined = isRoot
                ? this
                : this.$data[childKey]

              // Present a replace command to each child
              // If the child does not exists (maybe removed by a previous command, recreate the child)
              if (instance === undefined) {
                if (childKey) {
                  add(this, command.value, childKey as string)
                  accepted = true
                } else {
                  warn('[CRAFTER] Unknown child key', childKey)
                }
              } else {
                instance.$present([subCommand], false) // don't add migration for the sub commands
                // The change is valid when the child instance did change
                if (
                  // Edge case, the target node is the root node
                  isRoot && didChange(this.$data[getChildKey(this.$path, subCommand.path)!]) ||
                  didChange(instance)
                ) {
                  accepted = true
                }
              }
            }
          )

          const result = {
            accepted,
            migration: addMigration && accepted
              ? createReplaceMigration(command, {
                replaced: snapshot,
              })
              : undefined
          }

          proposalResult.push({
            command,
            result,
            isNodeOp: true,
          })
        } else {
          const childKey = getChildKey<TYPE>(this.$path, command.path)
          let instance: IInstance<any> | undefined = this.$data[childKey]
          
          if (instance === undefined) {
            if (childKey) {
              add(this, command.value, childKey as string)
                        /* const result = {
            accepted,
            migration: accepted && addMigration
              ? createReplaceMigration(command, {
                replaced: snapshot,
              })
              : undefined,
          }

          proposalResult.push({
            command,
            result,
            isNodeOp: false, // instance can't be undefined at this point
          }) */

            } else {
              warn('[CRAFTER] Unknown child key', childKey)
            }
          } else {
            instance.$present([command], addMigration)
          }
        }
      } else if (command.op === Operation.remove) {
        let accepted = false
        const key = getObjectKey(this, command)
        const isNodeOp = isNode(this.$data[key])
        const removed = this.$data[key]?.$snapshot
        if (key in this.$data) {
          remove(this, key)
          accepted = true
        }
        const result = {
          accepted,
          migration: accepted && addMigration
            ? createRemoveMigration(command, { removed })
            : undefined,
        }

        proposalResult.push({
          command,
          result,
          isNodeOp,
        })
      } else if (command.op === Operation.add) {
        let accepted = false
        const key = getObjectKey(this, command)
        // Is an alias of replace
        if (!(key in this.$data)) {
          add(this, command.value, key)
          accepted = true
        }
        const result = {
          accepted,
          migration: accepted && addMigration ? createAddMigration(command) : undefined,
        }

        proposalResult.push({
          command,
          result,
          isNodeOp: isNode(this.$data[key]),
        })
      } else if (command.op === Operation.copy) {
        const changes = copy(this, command)
        const isNodeOp = isNode(
          this.$data[getChildKey(this.$path, command.from)!]
        )
        const accepted = changes === undefined
        const result = {
          accepted,
          migration: accepted && addMigration
            ? createCopyMigration(command, changes!)
            : undefined
        }

        proposalResult.push({
          command,
          result,
          isNodeOp,
        })
      } else if (command.op === Operation.move) {
        const fromKey = getChildKey(this.$path, command.from)!
        if (!fromKey) {
          continue
        }
        const isNodeOp = isNode(this.$data[fromKey])
        const changes = move(this, command)
        const accepted = changes !== undefined
        const result = {
          accepted,
          migration: accepted && addMigration
            ? createMoveMigration(command, changes!)
            : undefined
        }

        proposalResult.push({
          command,
          result,
          isNodeOp,
        })
      } else {
        throw new Error(`Crafter ObjectInstance.$present: ${
          (proposal as any).op
        } is not a supported command. This error happened
            during a migration command. The transaction is cancelled and the model is reset to its previous value.`)
      }
    }
    const hasChanged = proposalResult.some(({result: {accepted}}) => accepted)
    this.$updateState(proposalResult, hasChanged)
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
    const value =
      this.$identifierKey === key
        ? this.$$id
        : isInstance(item)
        ? getSnapshot(item)
        : item

    return this.$type.properties[key].create(value, {
      context: this.$$container,
    }) as any
  }

  private $updateState(proposalResult: ProposalResult, hasChanged: boolean) {
    this.$state = {
      didChange: hasChanged,
      migration: toMigration(proposalResult)
    }
    // The node is stale only when :
    // - its shape has been modified
    // - a command targeted its value and made some changes
    const isStale = proposalResult.some(
      r =>
        (isAccepted(r) && didUpdateShape(r, this.$path)) ||
        (r.isNodeOp && !!r.result.migration?.forward.length)
    )

    this.next(isStale)
  }

  private next(isStale: boolean) {
    // The proposal has updated the shape of the model
    if (isStale) {
    //  le node est déjà inclus. Pb de nettoyage ?
      this.$$container.addUpdatedObservable(this)
      this.$invalidateSnapshot()
    }
    this.$$container.addMigration(this.$state.migration, this.$$id)
  }

  /*  private $setValue(value: INPUT): boolean {
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
  } */

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
  obj.$$container.step(function() {
    Object.keys(obj.$type.properties).forEach(function(key) {
      // Computed value: bind it to the object
      if (isDerivation(obj.$type.properties[key])) {
        Object.defineProperty(obj, key, {
          get() {
            return obj.$type.properties[key].get(obj)
          },
          enumerable: true,
          configurable: true,
        })
      } else {
        obj.$present(
          [
            {
              op: Operation.add,
              path: makePath(obj.$path, key),
              value: value[key],
            },
          ],
          false
        )
      }
    })
  })
}

function addInterceptor(
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
        obj.$$container
          .getReferenceTarget(obj.$data[propName].$value)
          .$present([
            {
              op: Operation.replace,
              path: makePath(obj.$path, propName),
              value,
            },
          ])
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
            instance.$$container.notifyRead(
              instance,
              makePath(getRoot(instance).$id, instance.$path)
            )
          }
          // return the instance if it is a node or the value if it is a leaf
          return unbox(instance)
        }
      },
      set(value: any) {
        // If the value is an object, cut it down in atomic JSON command
        obj.$present(
          [
            {
              op: Operation.replace,
              value: value instanceof Map ? Array.from(value.entries()) : value,
              path: makePath(obj.$path, propName),
            },
          ],
          true
        )
      },
      enumerable: true,
      configurable: true,
    })
  }
}

function isObject(thing: any): thing is object {
  return (
    !(thing instanceof Map) &&
    !Array.isArray(thing) &&
    typeof thing === 'object'
  )
}

export function cutDownUpdateOperation(value: any, opPath: string): Proposal {
  return isObject(value)
    ? Object.keys(value).map(key => ({
        op: Operation.replace,
        path: makePath(opPath, key),
        value: value[key],
      }))
    : [
        {
          op: Operation.replace,
          path: opPath,
          value,
        },
      ]
}

function getObjectKey(model: INodeInstance<any>, op: BasicCommand): string {
  const index = String(getChildKey(model.$path, op.path))
  if (!isValidObjectIndex(model, index, op)) {
    throw new Error(
      `Crafter ${index} is not a property of the object instance.`
    )
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

function getIdentfierKey(
  type: ObjectType<any, any, any, any>
): string | undefined {
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

function didChange(instance: IInstance<any>) {
  return !!instance.$state.didChange
}

function isAccepted({ result: { accepted } }: { result: CommandResult }) {
  return accepted
}

function didUpdateShape(
  {
    command,
    result: { accepted },
  }: { command: Command; result: CommandResult },
  nodePath: string
) {
  return (
    accepted &&
    isShapeMutationOperation(command.op) &&
    command.path === nodePath
  )
}

/**
 * Add a child to a model at a given key/index
 *
 */
function add(
  model: ObjectInstance<any, any, any, any>,
  value: any,
  index: string
): void {
  // Create props key if needed
  if (!(index in model.$type.properties)) {
    model.$type.properties[index] = getTypeFromValue(value)
  }
  const instance = model.$createChildInstance(value, index)
  model.$data[index] = instance
  addInterceptor(model, index)
  instance.$attach(model, index)
}

function toMigration(proposalResult: ProposalResult): Migration<any, any> {
  const forward = []
  const backward = []
  for (const {result} of proposalResult) {
    if (result.migration?.forward.length) {
      forward.push(...result.migration.forward)
    }
    if (result.migration?.backward.length) {
      backward.push(...result.migration.backward)
    }
  }
  return {
    forward,
    backward
  }
}