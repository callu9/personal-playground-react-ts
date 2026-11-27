import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import type { Approach } from './contract'

// Every approach exposes the same hooks, so the tree above them stays identical.
export interface Binding {
  Provider(props: { children: ReactNode }): ReactNode
  useIsWon(): boolean
  useSelected(id: string): boolean
  useToggle(): () => void
  useSelect(): (id: string) => void
}

interface State {
  isWon: boolean
  selectedId: string | null
  toggle(): void
  select(id: string): void
}

const contextOne: Binding = (() => {
  const Context = createContext<State>(null as never)
  return {
    Provider({ children }) {
      const [isWon, setIsWon] = useState(true)
      const [selectedId, setSelectedId] = useState<string | null>(null)
      const toggle = useCallback(() => setIsWon((value) => !value), [])
      const value = useMemo(() => ({ isWon, selectedId, toggle, select: setSelectedId }), [isWon, selectedId, toggle])
      return <Context value={value}>{children}</Context>
    },
    useIsWon: () => useContext(Context).isWon,
    useSelected: (id) => useContext(Context).selectedId === id,
    useToggle: () => useContext(Context).toggle,
    useSelect: () => useContext(Context).select,
  }
})()

const contextSplit: Binding = (() => {
  const Unit = createContext(true)
  const Selected = createContext<string | null>(null)
  const Actions = createContext<Pick<State, 'toggle' | 'select'>>(null as never)
  return {
    Provider({ children }) {
      const [isWon, setIsWon] = useState(true)
      const [selectedId, setSelectedId] = useState<string | null>(null)
      const actions = useMemo(() => ({ toggle: () => setIsWon((value) => !value), select: setSelectedId }), [])
      return (
        <Actions value={actions}><Unit value={isWon}><Selected value={selectedId}>{children}</Selected></Unit></Actions>
      )
    },
    useIsWon: () => useContext(Unit),
    useSelected: (id) => useContext(Selected) === id,
    useToggle: () => useContext(Actions).toggle,
    useSelect: () => useContext(Actions).select,
  }
})()

const useStore = create<State>()((set) => ({
  isWon: true,
  selectedId: null,
  toggle: () => set((state) => ({ isWon: !state.isWon })),
  select: (id) => set({ selectedId: id }),
}))

// Calling the hook without a selector subscribes to the whole store, as `const { isWon } = useStore()` does.
const zustandFull: Binding = {
  Provider: ({ children }) => children,
  useIsWon: () => useStore().isWon,
  useSelected: (id) => useStore().selectedId === id,
  useToggle: () => useStore().toggle,
  useSelect: () => useStore().select,
}

const zustandSelector: Binding = {
  Provider: ({ children }) => children,
  useIsWon: () => useStore((state) => state.isWon),
  useSelected: (id) => useStore((state) => state.selectedId === id),
  useToggle: () => useStore((state) => state.toggle),
  useSelect: () => useStore((state) => state.select),
}

export const bindings: Record<Approach, Binding> = {
  'context-one': contextOne,
  'context-split': contextSplit,
  'zustand-full': zustandFull,
  'zustand-selector': zustandSelector,
}
