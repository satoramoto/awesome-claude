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

const scenario = (state: Record<string, unknown>): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('launcher', state)
    onChange(() => void paint())
    void paint()
    return host
  },
})

/** A CPU series a tick apart: a dev server idling with a rebuild's spike, and one busier. */
const idle = [0.4, 0.3, 0.5, 0.2, 0.3, 6.8, 22.4, 14.1, 3.2, 0.6, 0.4, 0.3]
const busier = [8, 12, 9, 15, 21, 18, 26, 31, 24, 19, 22, 17]

/** The busy scenario with what each answering server last measured: its terminal row draws a CPU sparkline. */
const measured = (() => {
  const busy = fixtures.busy as { servers: Record<string, Record<string, unknown>> }
  return {
    ...busy,
    servers: {
      ...busy.servers,
      app: { ...busy.servers.app, cpu: idle, rss: 182 * 1024 * 1024 },
      storybook: { ...busy.servers.storybook, cpu: busier, rss: 412 * 1024 * 1024 },
    },
    open: ['app'],
  }
})()

export const Busy = scenario(fixtures.busy)
export const Measured = scenario(measured)
export const Stopped = scenario(fixtures.stopped)
export const Long = scenario(fixtures.long)
export const NoFile = scenario(fixtures.noFile)
export const Reading = scenario(fixtures.reading)
