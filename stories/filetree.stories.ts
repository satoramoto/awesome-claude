import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '@bench/engine'
import { collect, engine, panes } from '@bench/host'
import { h } from '@bench/render'
import type { Node, Surface } from '@bench/render'

import * as fixtures from '../playground/fixtures/filetree'
import * as mod from '../mods/filetree/hooks/register'
import { show, where } from './show'

// The whole filetree pane (a fork of data-goblin/claude-code-filetree), from the
// mod's own render hook, one story per scenario. In the terminal it draws with the
// kit's terminal system (a section header, TREE connectors under the top level,
// git states as name colours with the figures dim, the cursor row's `▌` gutter
// mark, no measure: a tree wants every cell); its rows are a `Client` (rows.tsx) that
// animates the shimmer on its own; on the desktop the hook draws them with the kit
// (hooks/desktop.tsx), Claude's activity as lit rows. The `…Focused` stories draw
// the pane with the keyboard: the cursor's mark full strength, its name bold, and
// the key hints at the foot.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Filetree', parameters: { paneTitle: 'Files' } }
export default meta

/** The pane as the host draws it, but with the keyboard (the host's `panes` draws it without). */
const focusedPane = async (surface: Surface, columns: number): Promise<Node[]> => {
  const out: Node[] = []
  for (const r of hooks.filter(r => r.event === 'ui.render' && r.matcher.component === 'Pane')) {
    const e = {
      component: 'Pane',
      requestId: r.matcher.requestId,
      surface,
      props: { title: String(r.matcher.requestId), isFocused: true, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    }
    out.push((await r.hook(engine, e, async () => h('Text', { dimColor: true }, '(the engine draws its own)'))) as Node)
  }
  return out
}

const scenario = (name: keyof typeof fixtures, focused = false): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = focused ? await focusedPane(surface, columns) : await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('filetree', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    return host
  },
})

export const Repo = scenario('repo')
export const RepoFocused = scenario('repo', true)
export const Working = scenario('working')
export const Committed = scenario('committed')
export const Pushing = scenario('pushing')
export const PushFailed = scenario('pushFailed')
export const Selected = scenario('selected')
export const SelectedFocused = scenario('selected', true)
export const Reading = scenario('reading')
export const Sizes = scenario('sizes')
export const Search = scenario('search')
export const NoRepo = scenario('noRepo')
export const LongNames = scenario('longNames')
export const LongNamesFocused = scenario('longNames', true)
export const GitLab = scenario('gitlab')
export const Forgejo = scenario('forgejo')
export const OtherRemote = scenario('otherRemote')
export const Untracked = scenario('untracked')
