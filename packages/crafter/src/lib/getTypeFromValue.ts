import { map } from '../map/factory';
import { object } from '../object/factory';
import { optional } from '../optional';
import { boolean, number, string, timeStamp, unknown } from '../Primitive';
import { IInstance } from './IInstance';
import { isInstance } from './Instance';
import { IType } from './IType';
import { array } from '../array/factory';

export function getTypeFromValue<T extends string | number | object | any[] | Map<any, any> | IInstance<any>>(value: T, isStrict: boolean = false): IType<any> {
  if (isInstance(value)) {
    return value.$type;
  }
  if (value instanceof Map) {
    const hasValue = getTypeFromValue(value.size);
    return hasValue
      ? map(getTypeFromValue(value.values().next().value))
      : map(unknown());
  }
  if (typeof value === 'undefined') {
    return unknown();
  }
  if (typeof value === 'string') {
    return string(value);
  }
  if (typeof value === 'number') {
    return number(value);
  }
  if (value instanceof Date) {
    return timeStamp(value.getTime());
  }
  if (typeof value === 'boolean') {
    return boolean(value);
  }
  if (Array.isArray(value)) {
    const hasValue = !!value.length;
    return hasValue ? array(getTypeFromValue(value[0])) : array(unknown());
  }
  // Else it is an object
  else {
    // build object
    const keys = Object.keys(value);
    const properties = {};
    keys.forEach(key => (properties[key] = isStrict
      ? getTypeFromValue(value[key], isStrict)
      : optional(getTypeFromValue(value[key]))));
    return object(properties);
  }
}
