import { IObservable } from '../IObservable'
import { DataObject, INodeInstance, NodeTree } from '../lib/INodeInstance'
import { IType } from '../lib/IType'
import { isNode, NodeInstance } from '../lib/NodeInstance'
import { setNonEnumerable } from '../setNonEnumerable'
import * as STManager from '../STManager'

export class ObjectInstance<T> extends NodeInstance<T, DataObject<T>> {
  public $data: DataObject<T>
  public $type: IType<T>
  constructor(
    type: IType<T>,
    { properties }: { properties: NodeTree<T> },
    id?: string
  ) {
    super(generateSnapshot, [], id)
    this.$type = type
    this.$data = {} as DataObject<T>
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    build(this, properties)
  }

  public $attach(parent: INodeInstance<any>, key: string): void {
    this.$parent = parent
    this.$parentKey = key
  }

  public $setValue(value: T): void {
    if (!STManager.isWrittable()) {
      throw new Error(
        'Crafter object. Tried to set an object value while model is locked.'
      )
    }
    Object.keys(this.$data).forEach(key => (this[key] = value[key]))
  }
}

function generateSnapshot<T>(data: DataObject<T>): T {
  const snapshot = {} as T
  for (const key in data) {
    snapshot[key] = data[key].$snapshot
  }
  return snapshot
}

function build(object: ObjectInstance<any>, properties: NodeTree<any>) {
  Object.keys(properties).forEach(key => {
    const prop = properties[key]
    if (isNode(prop)) {
      prop.$attach(object, key)
      object[key] = prop
    }
    addPropGetSet(object, key, prop)
  })
}

function addPropGetSet(obj: INodeInstance<any> & IObservable, propName: string | number, prop: INodeInstance<any> | string | number | boolean) {
  Object.defineProperty(obj, propName, {
    get() {
      STManager.addObservedPath(obj.$id + obj.$path + '/' + propName);
      const instance = obj.$data[propName];
      // return the instance if it is a node or the value if it is a leaf
      return isNode(instance) ? instance : instance.$value;
    },
    set(value: any) {
      // No direct manipulation. Mutations must occure only during a transaction.
      if (!STManager.isWrittable()) {
        return;
      }
      // Register the object on the list of observables used for the current transaction.
      // At the end of the transaction, the manager will call onTransactionEnd on each observable.
      STManager.addUpdatedObservable(obj);
      obj.$data[propName].$setValue(value);
      obj.$addPatch({
        op: 'replace',
        path: obj.$path + '/' + propName,
        value,
      });
    },
    enumerable: true,
    configurable: true,
  });
  obj.$data[propName] = prop;
}
