import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '../playground/engine'
import * as fixtures from '../playground/fixtures/issues'
import { collect, engine, panes } from '../playground/host'
import type { Node } from '../playground/render'
import * as mod from '../mods/issues/hooks/register'
import { show, where } from './show'

// The whole issues pane, from the mod's own render hook, one story per scenario.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Issues' }
export default meta

/**
 * The pane as the engine draws it with the keyboard (`isFocused`), which the
 * shared host never passes: the key hints and the cursor at full strength.
 */
const focusedPanes = async (surface: ReturnType<typeof where>['surface'], columns: number): Promise<Node[]> => {
  const out: Node[] = []
  for (const r of hooks.filter(r => r.event === 'ui.render' && r.matcher.component === 'Pane')) {
    const e = {
      component: 'Pane',
      requestId: r.matcher.requestId,
      surface,
      props: { title: 'Issues', isFocused: true, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    }
    out.push((await r.hook(engine, e, async () => null)) as Node)
  }
  return out
}

const scenario = (name: keyof typeof fixtures, opts: { focused?: boolean } = {}): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = opts.focused ? await focusedPanes(surface, columns) : await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('issues', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    return host
  },
})

export const Busy = scenario('busy')
export const Sprint = scenario('sprint')
export const Empty = scenario('empty')
export const NoRepo = scenario('noRepo')
export const Reading = scenario('reading')
/** A read under way: the last-good issues kept, the header's `↻ 4m` saying how old they are. */
export const Refreshing = scenario('refreshing')
/** A failed read: the last-good issues kept, an amber `▲ 12m` before the figures. */
export const RefreshFailed = scenario('refreshFailed')
/** The pane with the keyboard: the cursor's `▌` on #23, the key hints under the list. */
export const Focused = scenario('cursor', { focused: true })
/** The same cursor without the keyboard: its mark dim, the title its own weight, no hints. */
export const Blurred = scenario('cursor')
