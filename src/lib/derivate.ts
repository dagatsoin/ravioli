import {
  IObservable,
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableSet,
  runInAction,
} from "mobx";

export function derivate(target: IObservable, source: any) {
  runInAction(function () {
    if (
      isObservableArray(target) ||
      isObservableMap(target) ||
      isObservableSet(target)
    ) {
      target.replace(source);
    } else if (isObservableObject(target)) {
      Object.assign(target, source);
    } else if (isBoxedObservable(target)) {
      target.set(source);
    } else {
      console.error("Unknown observable type");
    }
  });
}
