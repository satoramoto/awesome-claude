import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '../playground/engine'
import * as fixtures from '../playground/fixtures/filetree'
import { collect, panes } from '../playground/host'
import * as mod from '../mods/filetree/hooks/register'
import { show, where } from './show'

// The whole filetree pane (a fork of data-goblin/claude-code-filetree), from the
// mod's own render hook, one story per scenario. Its rows are a `Client` (rows.tsx)
// that animates the shimmer on its own.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Filetree', parameters: { paneTitle: 'Files: web' } }
export default meta

const scenario = (name: keyof typeof fixtures): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('filetree', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    return host
  },
})

export const Repo = scenario('repo')
export const Working = scenario('working')
export const Committed = scenario('committed')
export const Pushing = scenario('pushing')
export const Sizes = scenario('sizes')
export const Search = scenario('search')
export const NoRepo = scenario('noRepo')
export const LongNames = scenario('longNames')
