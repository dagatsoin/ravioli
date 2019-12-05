/* eslint-disable max-classes-per-file */
import React from "react"
import PropTypes from "prop-types"
import { observer, inject, Provider } from "../src"
import { IValueMap } from "../src/types/IValueMap"
import { render } from "@testing-library/react"
import { IReactComponent } from "../src/types/IReactComponent"
import { getGlobal, observable } from "crafter/src"

const crafterContext = getGlobal().$$crafterContext

describe("inject based context", () => {
     test("basic context", () => {
        const C = inject("foo")(
            observer(
                class X extends React.Component<any, any> {
                    public render() {
                        return (
                            <div>
                                context:
                                {this.props.foo}
                            </div>
                        )
                    }
                }
            )
        )
        const B = () => <C />
        const A = () => (
            <Provider foo="bar">
                <B />
            </Provider>
        )
        const { container } = render(<A />)
        expect(container).toHaveTextContent("context:bar")
    })

    test("props override context", () => {
        const C = inject("foo")(
            class T extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        const B = () => <C foo={42} />
        const A = class T extends React.Component<any, any> {
            public render() {
                return (
                    <Provider foo="bar">
                        <B />
                    </Provider>
                )
            }
        }
        const { container } = render(<A />)
        expect(container).toHaveTextContent("context:42")
    })

    test("wraps displayName of original component", () => {
        const A: React.ComponentClass = inject("foo")(
            class ComponentA extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        const B: React.ComponentClass = inject()(
            class ComponentB extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        const C: React.ComponentClass = inject(() => ({}))(
            class ComponentC extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        expect(A.displayName).toBe("inject-with-foo(ComponentA)")
        expect(B.displayName).toBe("inject(ComponentB)")
        expect(C.displayName).toBe("inject(ComponentC)")
    })

    // FIXME: see other comments related to error catching in React
    // test does work as expected when running manually
    test("store should be available", () => {
        const C = inject("foo")(
            observer(
                class C extends React.Component<any, any> {
                    public render() {
                        return (
                            <div>
                                context:
                                {this.props.foo}
                            </div>
                        )
                    }
                }
            )
        )
        const B = () => <C />
        const A = class A extends React.Component<any, any> {
            public render() {
                return (
                    <Provider baz={42}>
                        <B />
                    </Provider>
                )
            }
        }

        expect(() => render(<A />)).toThrow(
            /Store 'foo' is not available! Make sure it is provided by some Provider/
        )
    })

    test("store is not required if prop is available", () => {
        const C = inject("foo")(
            observer(
                class C extends React.Component<any, any> {
                    public render() {
                        return (
                            <div>
                                context:
                                {this.props.foo}
                            </div>
                        )
                    }
                }
            )
        )
        const B = () => <C foo="bar" />
        const { container } = render(<B />)
        expect(container).toHaveTextContent("context:bar")
    })

    test("inject merges (and overrides) props", () => {
        const C = inject(() => ({ a: 1 }))(
            observer(
                class C extends React.Component<any, any> {
                    public render() {
                        expect(this.props).toEqual({ a: 1, b: 2 })
                        return null
                    }
                }
            )
        )
        const B = () => <C a={2} b={2} />
        render(<B />)
    })

    test("custom storesToProps", () => {
        const C = inject(
            function(stores: IValueMap, props: any) {
                expect(stores).toEqual({ foo: "bar" })
                expect(props).toEqual({ baz: 42 })
                return {
                    zoom: stores.foo,
                    baz: props.baz * 2
                }
            }
        )(
            observer(
                class C extends React.Component<any, any> {
                    public render() {
                        return (
                            <div>
                                context:
                                {this.props.zoom}
                                {this.props.baz}
                            </div>
                        )
                    }
                }
            )
        ) 
        const B = class B extends React.Component<any, any> {
            public render() {
                return <C baz={42} />
            }
        }
        const A = () => (
            <Provider foo="bar">
                <B />
            </Provider>
        )
        const { container } = render(<A />)
        expect(container).toHaveTextContent("context:bar84")
    })

    test("inject forwards ref", () => {
        class FancyComp extends React.Component<any, any> {
            public didRender
            public render() {
                this.didRender = true
                return null
            }

            public doSomething() {}
        }

        const ref = React.createRef<FancyComp>()
        render(<FancyComp ref={ref} />)
        expect(typeof ref.current?.doSomething).toBe("function")
        expect(ref.current?.didRender).toBe(true)

        const InjectedFancyComp = inject("bla")(FancyComp)
        const ref2 = React.createRef<FancyComp>()

        render(
            <Provider bla={42}>
                <InjectedFancyComp ref={ref2} />
            </Provider>
        )

        expect(typeof ref2.current?.doSomething).toBe("function")
        expect(ref2.current?.didRender).toBe(true)
    })
 
    test("inject should work with components that use forwardRef", () => {
        // eslint-disable-next-line react/display-name
        const FancyComp = React.forwardRef((_: any, ref: React.Ref<HTMLDivElement>) => <div ref={ref} />)

        const InjectedFancyComp = inject("bla")(FancyComp)
        const reference = React.createRef<HTMLDivElement>()

        render(
            <Provider bla={42}>
                <InjectedFancyComp ref={reference} />
            </Provider>
        )

        expect(reference.current).not.toBeNull()
        expect(reference.current).toBeInstanceOf(HTMLDivElement)
    })

    test("support static hoisting, wrappedComponent and ref forwarding", () => {
        class B extends React.Component<any, any> {
            public static foo
            public static bar
            public testField

            public render() {
                this.testField = 1
                return null
            }
        }
        ;(B as React.ComponentClass).propTypes = {
            x: PropTypes.object
        }
        B.foo = 17
        B.bar = {}
        const C = inject("booh")(B)
        expect(C.wrappedComponent).toBe(B)
        expect(B.foo).toBe(17)
        expect(C.foo).toBe(17)
        expect(C.bar === B.bar).toBeTruthy()
        expect(Object.keys(C.wrappedComponent.propTypes!)).toEqual(["x"])

        const ref = React.createRef<B>()

        render(<C booh={42} ref={ref} />)
        expect(ref.current?.testField).toBe(1)
    })

    test("propTypes and defaultProps are forwarded", () => {
        const msg: string[] = []
        const baseError = console.error
        console.error = m => msg.push(m)

        const C: React.ComponentClass<any> = inject("foo")(
            class C extends React.Component<any, any> {
                public render() {
                    expect(this.props.y).toEqual(3)

                    expect(this.props.x).toBeUndefined()
                    return null
                }
            }
        )
        C.propTypes = {
            x: PropTypes.func.isRequired,
            z: PropTypes.string.isRequired
        };

        (C as any).wrappedComponent.propTypes = {
            a: PropTypes.func.isRequired
        }
        C.defaultProps = {
            y: 3
        }
        const B = () => <C z="test" />
        const A = () => (
            <Provider foo="bar">
                <B />
            </Provider>
        )
        render(<A />)
        expect(msg.length).toBe(2)
        expect(msg[0].split("\n")[0]).toBe(
            "Warning: Failed prop type: The prop `x` is marked as required in `inject-with-foo(C)`, but its value is `undefined`."
        )
        expect(msg[1].split("\n")[0]).toBe(
            "Warning: Failed prop type: The prop `a` is marked as required in `C`, but its value is `undefined`."
        )
        console.error = baseError
    })

    test("warning is not printed when attaching propTypes to injected component", () => {
        let msg = []
        const baseWarn = console.warn
        console.warn = m => (msg = m)

        const C: React.ComponentClass = inject("foo")(
            class C extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        C.propTypes = {}

        expect(msg.length).toBe(0)
        console.warn = baseWarn
    })

    test("warning is not printed when attaching propTypes to wrappedComponent", () => {
        let msg = []
        const baseWarn = console.warn
        console.warn = m => (msg = m)
        const C = inject("foo")(
            class C extends React.Component<any, any> {
                public render() {
                    return (
                        <div>
                            context:
                            {this.props.foo}
                        </div>
                    )
                }
            }
        )
        C.wrappedComponent.propTypes = {}
        expect(msg.length).toBe(0)
        console.warn = baseWarn
    })

    test("using a custom injector is reactive", () => {
        const user = observable({ name: "Charlize" })
        const mapper = stores => ({
            name: stores.user.name
        })
        const DisplayName = (props: any) => <h1>{props.name}</h1>
        const User = inject(mapper)(DisplayName)
        const App = () => (
            <Provider user={user}>
                <User />
            </Provider>
        )
        const { container } = render(<App />)
        expect(container).toHaveTextContent("Charlize")

        crafterContext.transaction(() => {
            user.name = "Ghost"
        })
        expect(container).toHaveTextContent("Ghost")
    })

    test("using a custom injector is not too reactive", () => {
        let listRender = 0
        let itemRender = 0
        let injectRender = 0

        function connect(): IReactComponent {
            const args = arguments;
            return (component: IReactComponent) =>
                inject.apply(this, args)(observer(component))
        }

        class State {
            public model = observable({
                highlighted: {title: ''}
            })
            public isHighlighted(item) {
                return this.model.highlighted?.title === item.title 
            }

            public highlight = item => crafterContext.transaction(() => this.model.highlighted = item)
        }

        const items = observable([
            { title: "ItemA" },
            { title: "ItemB" },
            { title: "ItemC" },
            { title: "ItemD" },
            { title: "ItemE" },
            { title: "ItemF" }
        ])

        const state = new State()

        class ListComponent extends React.PureComponent<any> {
            public render() {
                listRender++
                const { items: _items } = this.props

                return (
                    <ul>
                        {_items.map(item => (
                            <ItemComponent key={item.title} item={item} />
                        ))}
                    </ul>
                )
            }
        }

        // @ts-ignore
        @connect(({ state: _state }, { item }) => {
            injectRender++
            if (injectRender > 6) {
                // debugger;
            }
            return {
                // Using
                // highlighted: expr(() => state.isHighlighted(item)) // seems to fix the problem
                highlighted: _state.isHighlighted(item),
                highlight: _state.highlight
            }
        })
        class ItemComponent extends React.PureComponent<any> {
            public highlight = () => {
                const { item, highlight } = this.props
                highlight(item)
            }

            public render() {
                itemRender++
                const { highlighted, item } = this.props
                return (
                    <li className={"hl_" + item.title} onClick={this.highlight}>
                        {item.title} {highlighted ? "(highlighted)" : ""}{" "}
                    </li>
                )
            }
        }

        const { container } = render(
            <Provider state={state}>
                <ListComponent items={items} />
            </Provider>
        )

        expect(listRender).toBe(1)
        expect(injectRender).toBe(6)
        expect(itemRender).toBe(6)

        container.querySelectorAll(".hl_ItemB").forEach((e: Element) => (e as HTMLElement).click())
        expect(listRender).toBe(1)
        expect(injectRender).toBe(12) // ideally, 7
        expect(itemRender).toBe(7)

        container.querySelectorAll(".hl_ItemF").forEach((e: Element) => (e as HTMLElement).click())
        expect(listRender).toBe(1)
        expect(injectRender).toBe(18) // ideally, 9
        expect(itemRender).toBe(9)
    })
}) 
/* 
test("#612 - mixed context types", () => {
    const SomeContext = React.createContext(true)

    class MainCompClass extends React.Component<any, any> {
        public static contextType = SomeContext
        public render() {
            const active = this.context
            return active ? this.props.value : "Inactive"
        }
    }

    const MainComp = inject((stores: any) => ({
        value: stores.appState.value
    }))(MainCompClass)

    const appState = observable({
        value: "Something"
    })

    function App() {
        return (
            <Provider appState={appState}>
                <SomeContext.Provider value={true}>
                    <MainComp />
                </SomeContext.Provider>
            </Provider>
        )
    }

    render(<App />)
})  */