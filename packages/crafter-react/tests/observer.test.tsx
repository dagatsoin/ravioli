// eslint-disable-next-line max-classes-per-file
import React from 'react'

import { render } from "@testing-library/react"
import { observable } from 'crafter/src/lib/observable'
import { getGlobal } from 'crafter'
import { observer, inject, ObserverComponent as Observer } from "../src"
import { computed, optional, object, string } from 'crafter/src'

const context = getGlobal().$$crafterContext

test('Should handle state changing in constructors', () => {
  const a = observable({
    count: 0,
  })
  const Child = observer(
    class Child extends React.Component {
      constructor(p) {
        super(p)
        context.transaction(() => a.count++) // one shouldn't do this!
        this.state = {}
      }
      public render() {
        return (
          <div>
            child:
            {a.count} -{' '}
          </div>
        )
      }
    }
  )
  const ParentWrapper = observer(() => (
    <span>
      <Child />
      parent:
      {a.count}
    </span>
  ))

  const { container } = render(<ParentWrapper />)
  expect(container).toHaveTextContent('child:1 - parent:1')

  context.transaction(() => a.count++)
  expect(container).toHaveTextContent('child:2 - parent:2')

  context.transaction(() => a.count++)
  expect(container).toHaveTextContent('child:3 - parent:3')
})

 //  some test suite is too tedious
 

const getDNode = (path: string) => (context as any).getTargets(path)

afterEach(() => {
    jest.useRealTimers()
})

describe("nestedRendering", () => {
    let store

    let todoCompleteRenderings
    const TodoComplete = observer(function TodoItem(props) {
        todoCompleteRenderings++
        return <>{props.todo.completed && ' - x'}</>
    })
    
    let todoItemRenderings
    const TodoTitle = observer(function TodoItem(props) {
        todoItemRenderings++
        return <li>|{props.todo.title}<TodoComplete todo={props.todo}/></li>
    })

    let todoListRenderings
    const TodoList = observer(
        class TodoList extends React.Component {
            public render() {
                todoListRenderings++
                const todos = store.todos
                return (
                    <div>
                        <span>{todos.length}</span>
                        {todos.map((todo, idx) => <TodoTitle key={idx} todo={todo} />)}
                    </div>
                )
            }
        }
    )

    beforeEach(() => {
        context.clearContainer()
        todoCompleteRenderings = 0
        todoItemRenderings = 0
        todoListRenderings = 0
        store = observable({
            todos: [
                {
                    title: "a",
                    completed: false
                }
            ]
        })
    })

    test("first rendering", () => {
        const { container } = render(<TodoList />)

        expect(todoListRenderings).toBe(1)
        expect(container.querySelectorAll("li").length).toBe(1)
        expect(container.querySelector("li")).toHaveTextContent("|a")
        expect(todoItemRenderings).toBe(1)
        expect(todoCompleteRenderings).toBe(1)
    })

    test("second rendering with inner store changed", () => {
        const { container } = render(<TodoList />)

        context.transaction(() => store.todos[0].title += "a")
        expect(container.querySelector("li")).toHaveTextContent("|aa")
        expect(todoListRenderings).toBe(1)
        expect(todoItemRenderings).toBe(2)
        expect(todoCompleteRenderings).toBe(1)
        expect(getDNode(store.$id + '/todos/length').length).toBe(1)
        expect(getDNode(store.$id + store.todos[0].$path + '/title').length).toBe(1)
        expect(getDNode(store.$id + store.todos[0].$path + '/completed').length).toBe(1)
    })

    test("rerendering with outer store added", () => {
        const { container } = render(<TodoList />)

        context.transaction(() => store.todos.push({
            title: "b",
            completed: true
        }))

        expect(container.querySelectorAll("li").length).toBe(2)
        expect(
            Array.from(container.querySelectorAll("li"))
                .map(e => e.innerHTML)
                .sort()
        ).toEqual(["|a", "|b - x"].sort())
        expect(todoListRenderings).toBe(2)
        expect(todoItemRenderings).toBe(2)
        expect(todoCompleteRenderings).toBe(2)
        expect(getDNode(store.$id + store.todos[1].$path + '/title').length).toBe(1)
        expect(getDNode(store.$id + store.todos[1].$path + '/completed').length).toBe(1)
    })

    test("rerendering with outer store pop", () => {
        const { container } = render(<TodoList />)

        const oldTodo = context.transaction(() => store.todos.pop())

        expect(todoListRenderings).toBe(2)
        expect(todoItemRenderings).toBe(1)
        expect(todoCompleteRenderings).toBe(1)
        expect(container.querySelectorAll("li").length).toBe(0)
        expect(getDNode(store.$id + oldTodo.$path + '/title').length).toBe(0)
        expect(getDNode(store.$id + oldTodo.$path + '/completed').length).toBe(0)
    })
})

describe("isObjectShallowModified detects when React will update the component", () => {
    const store = observable({ count: 0 })
    let counterRenderings = 0
    const Counter: React.FunctionComponent<any> = observer(function TodoItem() {
        counterRenderings++
        return <div>{store.count}</div>
    })

    test("does not assume React will update due to NaN prop", () => {
        render(<Counter value={NaN} />)

        context.transaction(() => store.count++)

        expect(counterRenderings).toBe(2)
    })
})


test("changing state in render should fail", () => {
    const data = observable({count: 2})
    const Comp = observer(() => {
        if (data.count === 3) {
            try {
                context.transaction(() => data.count = 4) // wouldn't throw first time for lack of observers.. (could we tighten this?)
            } catch (err) {
                expect(
                    /Transaction are not allowed here./.test(err)
                ).toBeTruthy()
            }
        }
        return <div>{data.count}</div>
    })
    render(<Comp />)

    context.transaction(() => data.count = 3)
    context.clearContainer()
})

test("observer component can be injected", () => {
    const msg: any[] = []
    const baseWarn = console.warn
    console.warn = m => msg.push(m)

    inject("foo")(
        observer(
            class T extends React.Component {
                public render() {
                    return null
                }
            }
        )
    )

    // N.B, the injected component will be observer since mobx-react 4.0!
    inject(() => {})(
        observer(
            class T extends React.Component {
                public render() {
                    return null
                }
            }
        )
    )

    expect(msg.length).toBe(0)
    console.warn = baseWarn
})

// Test on skip: since all reactions are now run in batched updates, the original issues can no longer be reproduced

test("should stop updating if error was thrown in render", () => {
    const data = observable({count: 0})
    let renderingsCount = 0
    let lastOwnRenderCount = 0
    const errors: any[] = []

    class Outer extends React.Component<{children: React.ReactNode}> {
        public state = { hasError: false }

        public static getDerivedStateFromError() {
            return { hasError: true }
        }

        public render() {
            return this.state.hasError ? <div>Error!</div> : <div>{this.props.children}</div>
        }

        public componentDidCatch(error, info) {
            errors.push(error.toString().split("\n")[0], info)
        }
    }

    const Comp = observer(
        class X extends React.Component {
            private ownRenderCount = 0

            public render() {
                lastOwnRenderCount = ++this.ownRenderCount
                renderingsCount++
                if (data.count === 2) {
                    throw new Error("!!!")
                }
                return <div />
            }
        }
    )
    render(
        <Outer>
            <Comp />
        </Outer>
    )

    // Check this
    expect(getDNode(data.$id + '/count').length).toBe(1)
    context.transaction(() => data.count++)
    expect(renderingsCount).toBe(2)
    expect(lastOwnRenderCount).toBe(2)
    context.transaction(() => data.count++)

    expect(getDNode(data.$id + '/count').length).toBe(0)
    context.transaction(() => data.count++)
    context.transaction(() => data.count++)
    context.transaction(() => data.count++)
    context.transaction(() => data.count++)
    expect(lastOwnRenderCount).toBe(4)
    expect(renderingsCount).toBe(4)
})

describe("should render component even if setState called with exactly the same props", () => {
    let renderCount
    const Comp = observer(
        class T extends React.Component {
            public onClick = () => {
                this.setState({})
            }
            public render() {
                renderCount++
                return <div onClick={this.onClick} id="clickableDiv" />
            }
        }
    )

    beforeEach(() => {
        renderCount = 0
    })

    test("renderCount === 1", () => {
        render(<Comp />)

        expect(renderCount).toBe(1)
    })

    test("after click once renderCount === 2", () => {
        const { container } = render(<Comp />)
        const clickableDiv = container.querySelector("#clickableDiv") as HTMLElement

        clickableDiv.click()

        expect(renderCount).toBe(2)
    })

    test("after click twice renderCount === 3", () => {
        const { container } = render(<Comp />)
        const clickableDiv = container.querySelector("#clickableDiv") as HTMLElement

        clickableDiv.click()
        clickableDiv.click()

        expect(renderCount).toBe(3)
    })
})

test("it rerenders correctly if some props are non-observables - 1", () => {
    const odata = observable({ x: 1 })
    const data = { y: 1 }

    @observer
    class Comp extends React.Component<any, any> {
        public computed = computed(() => 
            // n.b: data.y would not rerender! shallowly new equal props are not stored
            this.props.odata.x
        )
        public render() {
            return (
                <span onClick={stuff}>
                    {this.props.odata.x}-{this.props.data.y}-{this.computed.get()}
                </span>
            )
        }
    }

    const Parent = observer(
        class Parent extends React.Component<any, any> {
            public render() {
                return <Comp data={this.props.data} odata={this.props.odata} />
            }
        }
    )

    function stuff() {
        data.y++
        context.transaction(() => {    
            odata.x++
        })
    }

    const { container } = render(<Parent odata={odata} data={data} />)

    expect(container).toHaveTextContent("1-1-1")
    stuff()
    expect(container).toHaveTextContent("2-2-2")
    stuff()
    expect(container).toHaveTextContent("3-3-3")
})

test("it rerenders correctly if some props are non-observables - 2", () => {
    context.clearContainer()
    let renderCount = 0
    const odata = observable({ x: 1 })

    @observer
    class Component extends React.Component<any, any> {
        // should recompute, since props.data is changed
        public computed = computed(() => this.props.data.y)

        public render() {
            renderCount++
            return (
                <span onClick={stuff}>
                    {this.props.data.y}-{this.computed.get()}
                </span>
            )
        }
    }

    const Parent = observer(props => {
        const data = { y: props.odata.x }
        return <Component data={data} odata={props.odata} />
    })

    function stuff() {
        odata.x++
    }

    const { container } = render(<Parent odata={odata} />)

    expect(renderCount).toBe(1)
    expect(container).toHaveTextContent("1-1")

    context.transaction(stuff)
    expect(renderCount).toBe(2)
    expect(container).toHaveTextContent("2-2")

    context.transaction(stuff)
    expect(renderCount).toBe(3)
    expect(container).toHaveTextContent("3-3")
})

describe("Observer regions should react", () => {
    let data
    const Comp = () => (
        <div>
            <Observer>{() => <span data-testid="inside-of-observer">{data.field}</span>}</Observer>
            <span data-testid="outside-of-observer">{data.field}</span>
        </div>
    )

    beforeEach(() => {
        data = observable({field: "hi"})
    })

    test("init state is correct", () => {
        const { queryByTestId } = render(<Comp />)

        expect(queryByTestId("inside-of-observer")).toHaveTextContent("hi")
        expect(queryByTestId("outside-of-observer")).toHaveTextContent("hi")
    })

    test("set the data to hello", () => {
        const { queryByTestId } = render(<Comp />)

        context.transaction(() => data.field = "hello")

        expect(queryByTestId("inside-of-observer")).toHaveTextContent("hello")
        expect(queryByTestId("outside-of-observer")).toHaveTextContent("hi")
    })
})

test("Observer should not re-render on shallow equal new props", () => {
    let childRendering = 0
    let parentRendering = 0
    const data = { x: 1 }
    const odata = observable({ y: 1 })

    const Child = observer(({ data: _data }) => {
        childRendering++
        return <span>{_data.x}</span>
    })
    const Parent = observer(() => {
        parentRendering++
        odata.y // depend
        return <Child data={data} />
    })

    const { container } = render(<Parent />)

    expect(parentRendering).toBe(1)
    expect(childRendering).toBe(1)
    expect(container).toHaveTextContent("1")

    context.transaction(() => {
        odata.y++
    })
    expect(parentRendering).toBe(2)
    expect(childRendering).toBe(1)
    expect(container).toHaveTextContent("1")
})

test("parent / childs render in the right order", () => {
    // See: https://jsfiddle.net/gkaemmer/q1kv7hbL/13/
    const events: any[] = []

    const store = object({
        user: optional(object({
            name: string()
        }))
    }).create({
        user: {name: 'Fraktar'}
    })

    const logout = () => context.transaction(function() {
        store.user = undefined
    })

    const Parent = observer(() => {
        events.push("parent")
        if (!store.user) return <span>Not logged in.</span>
        return (
            <div>
                <Child />
            </div>
        )
    })

    const Child = observer(() => {
        events.push("child")
        return <span>Logged in as: {store.user?.name}</span>
    })

    render(<Parent />)

    logout()
    expect(events).toEqual(["parent", "child", "parent"])
})

describe("use Observer inject and render sugar should work  ", () => {
    test("use render without inject should be correct", () => {
        const Comp = () => (
            <div>
                <Observer render={() => <span>{123}</span>} />
            </div>
        )
        const { container } = render(<Comp />)
        expect(container).toHaveTextContent("123")
    })

    test("use children without inject should be correct", () => {
        const Comp = () => (
            <div>
                <Observer>{() => <span>{123}</span>}</Observer>
            </div>
        )
        const { container } = render(<Comp />)
        expect(container).toHaveTextContent("123")
    })

    test("show error when using children and render at same time ", () => {
        const Comp = () => (
            <div>
                <Observer render={() => <span>{123}</span>}>{() => <span>{123}</span>}</Observer>
            </div>
        )
        expect(() => render(<Comp />)).toThrowError("Crafter React Observer: Do not use children and render in the same time.`")
    })
})

test("use PureComponent", () => {
    const msg: any[] = []
    const baseWarn = console.warn
    console.warn = m => msg.push(m)

    try {
        observer(
            class X extends React.PureComponent {
                public return() {
                    return <div />
                }
            }
        )

        expect(msg).toEqual([])
    } finally {
        console.warn = baseWarn
    }
})

test("static on function components are hoisted", () => {
    const Comp = () => <div />
    Comp.foo = 3

    const Comp2 = observer(Comp)

    expect(Comp2.foo).toBe(3)
})

test("computed properties react to props", () => {
    jest.useFakeTimers()

    const seen: any[] = []
    @observer
    class Child extends React.Component<any, any> {
        public propX = computed(() => this.props.x)
        public render() {
            seen.push(this.propX.get())
            return <div>{this.propX.get()}</div>
        }
    }

    class Parent extends React.Component {
        public state = { x: 0 }
        public render() {
            seen.push("parent")
            return <Child x={this.state.x} />
        }

        public componentDidMount() {
            setTimeout(() => this.setState({ x: 2 }), 100)
        }
    }

    const { container } = render(<Parent />)
    expect(container).toHaveTextContent("0")

    jest.runAllTimers()
    expect(container).toHaveTextContent("2")

    expect(seen).toEqual(["parent", 0, "parent", 2])
})

test("#692 - componentDidUpdate is triggered", () => {
    jest.useFakeTimers()

    let cDUCount = 0

    @observer
    class Test extends React.Component<any, any> {
        public model = observable({counter: 0})
        constructor(props) {
            super(props)
            setTimeout(() => this.inc(), 300)
        }
        public inc = () => context.transaction(() => this.model.counter++)

        public render() {
            return <p>{this.model.counter}</p>
        }

        public componentDidUpdate() {
            cDUCount++
        }
    }
    render(<Test />)
    expect(cDUCount).toBe(0)

    jest.runAllTimers()
    expect(cDUCount).toBe(1)
})

test("#797 - replacing this.render should trigger a warning", () => {
    @observer
    class Component extends React.Component {
        public render() {
            return <div />
        }
        public swapRenderFunc() {
            this.render = () => <span />
        }
    }

    const compRef = React.createRef<Component>()
    const { unmount } = render(<Component ref={compRef} />)
    compRef.current?.swapRenderFunc()

    const msg: string[] = []
    const warnOrig = console.warn
    console.warn = m => msg.push(m)

    unmount()

    expect(msg.length).toBe(1)
    expect(msg[0]).toBe(
        `The render function for an observer component (Component) was modified after Crafter attached. This is not supported, since the new function can't be triggered by Crafter.`
    )
    console.warn = warnOrig
})