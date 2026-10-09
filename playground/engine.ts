// Stands in for the engine's 'claude-code' module in the playground: the mods'
// atoms read and write a store the page owns, and a write redraws the page.

type Ref = { plugin: string; key: string }
type Atom<T> = Ref & { initial: T }

const store = new Map<string, unknown>()
const listeners = new Set<() => void>()

const id = (ref: Ref) => `${ref.plugin}.${ref.key}`

export const atom = <T>(ref: Ref, initial: T): Atom<T> => ({ ...ref, initial })

export const read = async <T>(_$: unknown, a: Atom<T>): Promise<T> => (store.has(id(a)) ? (store.get(id(a)) as T) : a.initial)

export const update = async <T>(_$: unknown, a: Atom<T>, fn: (old: T) => T): Promise<void> => {
  store.set(id(a), fn(await read(_$, a)))
  for (const l of listeners) l()
}

/** Replaces a plugin's state with a fixture's. */
export const load = (plugin: string, state: Record<string, unknown>) => {
  for (const key of [...store.keys()]) if (key.startsWith(`${plugin}.`)) store.delete(key)
  for (const [key, value] of Object.entries(state)) store.set(`${plugin}.${key}`, structuredClone(value))
}

export const onChange = (fn: () => void) => listeners.add(fn)
