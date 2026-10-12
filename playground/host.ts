// Runs a mod's ui.render hooks outside the engine, for the playground and the
// stories: a `$` with the ui noun (every other call resolves undefined), and an
// `on` that collects the hooks register() adds; and their ui.message hooks,
// which answer a `Client`'s posts (see client.ts).

import type { ClientPost } from './client'
import { read } from './engine'
import { h } from './render'
import type { Child, Node, Surface } from './render'

type Hook = ($: unknown, e: any, next: (e: any) => Promise<unknown>) => unknown
export type Registered = { event: string; matcher: Record<string, unknown>; hook: Hook }

const ELEMENTS = ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Svg', 'Client']

const noop: any = new Proxy(() => Promise.resolve(undefined), { get: () => noop, apply: () => Promise.resolve(undefined) })

/**
 * The elements `$.ui.resolve` hands back: constructors taking props with
 * `children`, as the engine's are, so a mod can call them (`Box({ children })`,
 * as blast-radius does) or use them in JSX (`h` calls a function type).
 */
export const elements: Record<string, (props?: Record<string, any>) => Node> = Object.fromEntries(
  ELEMENTS.map(type => [
    type,
    (props: Record<string, any> = {}): Node => {
      const { children, ...rest } = props
      return { type, props: rest, children: children === undefined ? [] : ([children] as Child[]).flat(Infinity as 1) }
    },
  ]),
)

/**
 * The engine as a render hook sees it: `ui.resolve`, `state.get` (the stand-in
 * store, as atoms read it) and `clock.now`; every other call resolves undefined.
 */
export const engine: any = new Proxy(
  {},
  {
    get: (_, noun) =>
      noun === 'ui'
        ? new Proxy({}, { get: (_, verb) => (verb === 'resolve' ? () => elements : noop) })
        : noun === 'state'
          ? { get: async (ref: { plugin: string; key: string }) => ({ value: await read(null, { ...ref, initial: undefined }) }) }
          : noun === 'clock'
            ? { now: async () => Date.now() }
            : noop,
  },
)

/** Runs a hooks module's register() and returns the hooks it added. */
export const collect = (mod: { register: (on: any, options: any) => void }): Registered[] => {
  const hooks: Registered[] = []
  const on = (event: string, matcherOrHook: any, maybeHook?: Hook) => {
    const [matcher, hook] = typeof matcherOrHook === 'function' ? [{}, matcherOrHook] : [matcherOrHook, maybeHook!]
    hooks.push({ event, matcher, hook })
    const handle = { catch: () => handle }
    return handle
  }
  mod.register(on, {})
  return hooks
}

/**
 * A `Client`'s post as the engine delivers it: the hooks' `ui.message` chain,
 * matchers compared by equality, outermost (first registered) first. What it
 * answers (`{ props }`) goes back to the instance. Pass to `draw`'s
 * `client.post`, or to `configureClients({ post })`.
 */
export const messages =
  (hooks: Registered[]): ClientPost =>
  async message => {
    const chain = hooks.filter(r => r.event === 'ui.message' && Object.entries(r.matcher).every(([k, v]) => (message as any)[k] === v))
    const at = async (i: number, e: any): Promise<unknown> => (i < chain.length ? chain[i]!.hook(engine, e, next => at(i + 1, next)) : undefined)
    return at(0, { ...message })
  }

/** Every Pane the hooks draw, for `surface` at `columns` wide. */
export const panes = async (hooks: Registered[], surface: Surface, columns: number): Promise<Node[]> => {
  const out: Node[] = []
  for (const r of hooks.filter(r => r.event === 'ui.render' && r.matcher.component === 'Pane')) {
    const e = {
      component: 'Pane',
      requestId: r.matcher.requestId,
      surface,
      props: { title: String(r.matcher.requestId), isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    }
    out.push((await r.hook(engine, e, async () => h('Text', { dimColor: true }, '(the engine draws its own)'))) as Node)
  }
  return out
}
