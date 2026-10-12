import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '../playground/engine'
import * as fixtures from '../playground/fixtures/overview'
import { collect, panes } from '../playground/host'
import { draw } from '../playground/render'
import type { Node } from '../playground/render'
import * as mod from '../mods/overview/hooks/register'
import { show, where } from './show'

// The whole overview pane, from the mod's own render hook, one story per scenario.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Overview' }
export default meta

const scenario = (name: keyof typeof fixtures): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const trees = await panes(hooks, surface, columns)
      host.replaceChildren(...trees.map(t => show(t, ctx)))
    }
    load('overview', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    return host
  },
})

export const Busy = scenario('busy')
export const Fresh = scenario('fresh')
export const NearLimit = scenario('nearLimit')

/** The widths the terminal sheet draws the pane at, in cells. */
const WIDTHS = [30, 40, 60, 100]

/**
 * A scenario on the terminal at 30, 40, 60 and 100 columns side by side, whatever
 * the toolbar says: the point is that nothing overflows or wraps at any of them.
 */
const terminalSheet = (name: keyof typeof fixtures): StoryObj => ({
  globals: { frame: 'pane', surface: 'terminal', columns: '110' },
  render: (_, ctx) => {
    const host = document.createElement('div')
    host.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#8e8e93'
    const paint = async () => {
      const cells = await Promise.all(
        WIDTHS.map(async w => {
          const cell = document.createElement('div')
          const label = Object.assign(document.createElement('div'), { textContent: `terminal · ${w} columns` })
          label.style.marginBottom = '4px'
          const pane = document.createElement('div')
          pane.className = 'pane terminal'
          const body = document.createElement('div')
          body.className = 'body'
          body.style.width = `${w}ch`
          body.style.overflow = 'hidden'
          for (const tree of await panes(hooks, 'terminal', w)) {
            const drawn = draw(tree as Node, 'terminal', fn => fn(), { client: { site: `${ctx.id}-${w}` } })
            if (drawn) body.append(drawn)
          }
          pane.append(body)
          cell.append(label, pane)
          return cell
        }),
      )
      host.replaceChildren(...cells)
    }
    load('overview', fixtures[name] as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    // The sheet draws its own panes: the toolbar's frame around it steps aside.
    setTimeout(() => {
      const frame = host.closest('.pane') as HTMLElement | null
      const body = host.closest('.body') as HTMLElement | null
      if (frame) frame.style.cssText = 'background:none;padding:0;display:block'
      if (body) body.style.width = 'auto'
    })
    return host
  },
})

export const BusyTerminalWidths = terminalSheet('busy')
export const NearLimitTerminalWidths = terminalSheet('nearLimit')
