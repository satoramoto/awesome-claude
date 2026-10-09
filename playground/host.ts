// Runs a mod's ui.render hooks outside the engine, for the playground and the
// stories: a `$` with the ui noun (every other call resolves undefined), and an
// `on` that collects the hooks register() adds.

import { h } from './render'
import type { Node, Surface } from './render'

type Hook = ($: unknown, e: any, next: (e: any) => Promise<unknown>) => unknown
export type Registered = { event: string; matcher: Record<string, unknown>; hook: Hook }

const ELEMENTS = ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Svg', 'Client']

const noop: any = new Proxy(() => Promise.resolve(undefined), { get: () => noop, apply: () => Promise.resolve(undefined) })

/** The engine as a render hook sees it. */
export const engine: any = new Proxy(
  {},
  {
    get: (_, noun) =>
      noun === 'ui'
        ? new Proxy({}, { get: (_, verb) => (verb === 'resolve' ? () => Object.fromEntries(ELEMENTS.map(n => [n, n])) : noop) })
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
