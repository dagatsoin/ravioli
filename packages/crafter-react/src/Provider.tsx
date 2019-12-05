import React from "react"
import { IValueMap } from "./types/IValueMap"

export const CrafterProviderContext = React.createContext<IValueMap>({})

export interface ProviderProps extends IValueMap {
    children: React.ReactNode
}

export function Provider(props: ProviderProps) {
    const { children, ...stores } = props
    const parentValue = React.useContext(CrafterProviderContext)
    const mutableProviderRef = React.useRef({ ...parentValue, ...stores })
    const value = mutableProviderRef.current

    return <CrafterProviderContext.Provider value={value}>{children}</CrafterProviderContext.Provider>
}

Provider.displayName = "CrafterProvider"