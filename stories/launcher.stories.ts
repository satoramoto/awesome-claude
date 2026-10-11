import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '../playground/engine'
import * as fixtures from '../playground/fixtures/launcher'
import { collect, panes } from '../playground/host'
import * as mod from '../mods/launcher/hooks/register'
import { show, where } from './show'

// The whole launcher pane, from the mod's own render hook, one story per scenario.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Launcher' }
export default meta

const scenario = (name: keyof typeof fixtures): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('launcher', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    return host
  },
})

export const Busy = scenario('busy')
export const Stopped = scenario('stopped')
export const Long = scenario('long')
export const NoFile = scenario('noFile')
export const Reading = scenario('reading')
