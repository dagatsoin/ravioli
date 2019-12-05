import React from "react"

import { CrafterProviderContext, Provider } from "../src"
import { render } from "@testing-library/react"

describe("Provider", () => {
    it("should work in a simple case", () => {
        function A() {
            return (
                <Provider foo="bar">
                    <CrafterProviderContext.Consumer>{({ foo }) => foo}</CrafterProviderContext.Consumer>
                </Provider>
            )
        }

        const { container } = render(<A />)
        expect(container).toHaveTextContent("bar")
    })

    it("should not provide the children prop", () => {
        function A() {
            return (
                <Provider>
                    <CrafterProviderContext.Consumer>
                        {stores =>
                            Reflect.has(stores, "children")
                                ? "children was provided"
                                : "children was not provided"
                        }
                    </CrafterProviderContext.Consumer>
                </Provider>
            )
        }

        const { container } = render(<A />)
        expect(container).toHaveTextContent("children was not provided")
    })

    it("supports overriding stores", () => {
        function B() {
            return (
                <CrafterProviderContext.Consumer>
                    {({ overridable, nonOverridable }) => `${overridable} ${nonOverridable}`}
                </CrafterProviderContext.Consumer>
            )
        }

        function A() {
            return (
                <Provider overridable="original" nonOverridable="original">
                    <B />
                    <Provider overridable="overriden">
                        <B />
                    </Provider>
                </Provider>
            )
        }
        const { container } = render(<A />)
        expect(container).toMatchInlineSnapshot(`
<div>
  original original
  overriden original
</div>
`)
    })
})