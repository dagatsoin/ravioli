// eslint-disable-next-line max-classes-per-file
import React, { Component } from 'react'
import { createTracker, ITracker, Reaction } from 'crafter'

import { setHiddenProp, newSymbol, patch, shallowEqual } from './utils'
import { IReactComponent } from './types/IReactComponent'

const reactionHolderKey = newSymbol('reactionHolderKey')
const crafterReactionIsDisposed = newSymbol("isUnmounted")
const skipRenderKey = newSymbol("skipRender")
const isForcingUpdateKey = newSymbol("isForcingUpdate")

const hasSymbol = typeof Symbol === "function" && Symbol.for

declare const __DEV__: boolean

// Using react-is had some issues (and operates on elements, not on types), see #608 / #609
const ReactForwardRefSymbol = hasSymbol
  ? Symbol.for("react.forward_ref")
  : typeof React.forwardRef === "function" && React.forwardRef(() => null)["$$typeof"]

const ReactMemoSymbol = hasSymbol
  ? Symbol.for("react.memo")
  : typeof React.memo === "function" && React.memo(() => null)["$$typeof"]

export function observer<T extends IReactComponent>(
  component: T
): T {
  if (component["isCrafterInjector"] === true) {
    console.warn(
        "Crafter observer: You are trying to use 'observer' on a component that already has 'inject'. Please apply 'observer' before applying 'inject'"
    )
  }

  if (ReactMemoSymbol && component["$$typeof"] === ReactMemoSymbol) {
      throw new Error(
          "Crafter observer: You are trying to use 'observer' on function component wrapped to either another observer or 'React.memo'. The observer already applies 'React.memo' for you."
      )
  }
  if (ReactForwardRefSymbol && component["$$typeof"] === ReactForwardRefSymbol) {
    const baseRender = component["render"]
    if (typeof baseRender !== "function") {
        throw new Error("render property of ForwardRef was not a function")
    }
    return React.forwardRef(function() {
        const args = arguments;
        return <ObserverComponent>{() => baseRender.apply(undefined, args)}</ObserverComponent>
    }) as T
  }
  // Function component
  if (
      typeof component === "function" &&
      (!component.prototype || !component.prototype.render) &&
      !component["isReactClass"] &&
      !Object.prototype.isPrototypeOf.call(React.Component, component)
  ) {
    const wrapped = makeClassComponentObserver(class Observed extends React.Component {
      public render(): JSX.Element | null {
        return (component as React.FunctionComponent<any>)(this.props)
      }
    } as React.ComponentClass<any, any>) as T
    
    // Hoist static fields
    Object.keys(component).forEach(key => {
      wrapped[key] = component[key]
    })

    return wrapped 
  }

  // Class component
  return makeClassComponentObserver(component as React.ComponentClass<any, any>) as T
}

export function makeClassComponentObserver(
  componentClass: React.ComponentClass<any, any>
): React.ComponentClass<any, any> {
  const target = componentClass.prototype

  // If this is a pure component, let React be responsible to trigger render.
  if (componentClass["__proto__"] !== React.PureComponent) {
    // If not, let Crafter be responsible to trigger render.
    if (!target.shouldComponentUpdate) target.shouldComponentUpdate = observerSCU
    else if (target.shouldComponentUpdate !== observerSCU)
        // n.b. unequal check, instead of existence check, as @observer might be on superclass as well
        throw new Error(
            "It is not allowed to use shouldComponentUpdate in observer based components."
        )
  }

  // this.props and this.state are made observable, just to make sure computed fields that
  // are defined inside the component, and which rely on state or props, re-compute if state or props change
  // (otherwise the computed wouldn't update and become stale on props change, since props are not observable)
  makeObservableProp(target, "props")
  makeObservableProp(target, "state")

  const baseRender = target.render
  
  target.render = function(): Function {
    // It is the first time the component renders.
    // It is time to build the reactive renderer for the instance.
    return makeInstanceComponentReactive.call(this, baseRender)
  }
  patch(target, "componentWillUnmount", function() {
      if (this.render[reactionHolderKey]) {
          this.render[reactionHolderKey].dispose()
      } else if (__DEV__) {
        const displayName = getDisplayName(this)
        console.warn(
            `The render function for an observer component (${displayName}) was modified after Crafter attached. This is not supported, since the new function can't be triggered by Crafter.`
        )
      }
      this[crafterReactionIsDisposed] = true
  })
  return componentClass
}

// Generates a friendly name for debugging
function getDisplayName(comp: any) {
  return (
      comp.displayName ||
      comp.name ||
      (comp.constructor && (comp.constructor.displayName || comp.constructor.name)) ||
      "<component>"
  )
}

function observerSCU(nextProps: React.Props<any>, nextState: any): boolean {
  // update on any state changes (as is the default)
  if (this.state !== nextState) {
      return true
  }
  // update if props are shallowly not equal, inspired by PureRenderMixin
  // we could return just 'false' here, and avoid the `skipRender` checks etc
  // however, it is nicer if lifecycle events are triggered like usually,
  // so we return true here if props are shallowly modified.
  return !shallowEqual(this.props, nextProps)
}

/**
 * This function wraps the instance component render in a reactive function.
 * Any updated observable in it will trigger a rerender.
 * @param render 
 */
function makeInstanceComponentReactive(render: () => JSX.Element): Function {
  /**
   * If props are shallowly modified, react will render anyway,
   * so atom.reportChanged() should not result in yet another re-render
   */
  setHiddenProp(this, skipRenderKey, false)

  /**
   * forceUpdate will re-assign this.props. We don't want that to cause a loop,
   * so detect these changes
   */
  setHiddenProp(this, isForcingUpdateKey, false)

  let isRenderingPending = false
  // Define a reaction which will be trigger on:
  // - state updates
  // - props updates
  // - computed changes
  // - observable used in render changes
  const reaction = new Reaction(
    // 1- trigger a forceUpdate (in the following reaction)
    // 2- which in turn will trigger the reactive renderer. Here two things happens simultaneously:
    //   - the React render
    //   - the update of new/removed observables list
    // 3- After that Crafter will watch this new list of observables for changes.
    ({dispose}) => {
      if (!isRenderingPending) { 
        // N.B. Getting here *before mounting* means that a component constructor has side effects (see the relevant test in misc.js)
        // This unidiomatic React usage but React will correctly warn about this so we continue as usual
        // See observer.test.tsx
        isRenderingPending = true
        if (this[crafterReactionIsDisposed] !== true) {
          let hasError = true
          try {
              setHiddenProp(this, isForcingUpdateKey, true)
              if (!this[skipRenderKey]) {
                // Call the reactive render
                Component.prototype.forceUpdate.call(this)
              }
              hasError = false
          } finally {
              setHiddenProp(this, isForcingUpdateKey, false)
              if (hasError) {
                dispose()
              }
          } 
        }
      }
    }
  )

  const baseRender = render.bind(this)

  // Replace the isntance render function by the reactive function. 
  this.render = reactiveRender;
  this.render[reactionHolderKey] = reaction

  function reactiveRender(): React.ReactNode {
    isRenderingPending = false
    let exception: Error | undefined
    let element: JSX.Element | undefined

    // This is where the concrete render happens.
    // In the same time, Crafter will update a list of observables used
    // in the render function.
    reaction.observe(() => {
      element = baseRender()
    })

    if (exception || element === undefined) {
        throw exception || new Error('[Crafter React] Unable to get a renderer')
    }
    return element
  }

  // Call the render for the first time.
  // It will register all observable currently used in the render function.
  return reactiveRender.call(this);
}

function makeObservableProp(target: any, propName: string): void {
  const valueHolderKey = newSymbol(`reactProp_${propName}_valueHolder`)
  const atomHolderKey = newSymbol(`reactProp_${propName}_atomHolder`)
  function getTracker(): ITracker {
      if (!this[atomHolderKey]) {
        setHiddenProp(this, atomHolderKey, createTracker(propName))
      }
      return this[atomHolderKey]
  }
  Object.defineProperty(target, propName, {
      configurable: true,
      enumerable: true,
      get() {
          getTracker.call(this).reportObserved()
          return this[valueHolderKey]
      },
      set(v) {
        if (!this[isForcingUpdateKey] && !shallowEqual(this[valueHolderKey], v)) {
          setHiddenProp(this, valueHolderKey, v)
          setHiddenProp(this, skipRenderKey, true)
          getTracker.call(this).reportChanged()
          setHiddenProp(this, skipRenderKey, false)
      } else {
          setHiddenProp(this, valueHolderKey, v)
      }
    }
  })
}

interface IObserverProps {
  children?(): React.ReactElement<any>
  render?(): React.ReactElement<any>
}

export const ObserverComponent = observer(({ children, render }: IObserverProps): any => {
  const component = children || render
  if (children && render) {
    throw new Error(
        "Crafter React Observer: Do not use children and render in the same time.`"
    )
}
  if (component === undefined) {
      return function() {return null}
  }
  return component()
})