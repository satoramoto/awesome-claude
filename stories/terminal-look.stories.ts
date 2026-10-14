import type { Meta, StoryObj } from '@storybook/html'

import { load, onChange } from '@bench/engine'
import { collect, panes } from '@bench/host'
import { TERMINAL_THEMES, draw, terminalPaneClass } from '@bench/render'
import type { Node, TerminalTheme } from '@bench/render'

import * as filetreeMod from '../mods/filetree/hooks/register'
import * as issuesMod from '../mods/issues/hooks/register'
import * as launcherMod from '../mods/launcher/hooks/register'
import * as overviewMod from '../mods/overview/hooks/register'
import * as filetreeFixtures from '../playground/fixtures/filetree'
import * as issuesFixtures from '../playground/fixtures/issues'
import * as launcherFixtures from '../playground/fixtures/launcher'
import * as overviewFixtures from '../playground/fixtures/overview'

// This repo's mods side by side on the terminal. The kit's own sheets (each
// primitive at 30 to 100 columns, the glyphs, the file types, the skins) are in
// zen's Storybook under Harness/Claude Code/Kit.

type Args = Record<string, any>

const meta: Meta<Args> = { title: 'Mods/Terminal Look' }
export default meta

type Story = StoryObj<Args>

/** The toolbar's terminal theme (dark when it names none). */
const toolbarTheme = (ctx: { globals: Record<string, any> }): TerminalTheme => {
  const t = String(ctx.globals.theme ?? 'dark') as TerminalTheme
  return TERMINAL_THEMES.includes(t) ? t : 'dark'
}

/** The terminal themes the `theme` control picks: the toolbar's, one, or `all` four. */
const pickThemes = (choice: unknown, ctx: { globals: Record<string, any> }): TerminalTheme[] =>
  choice === 'all' ? [...TERMINAL_THEMES] : TERMINAL_THEMES.includes(choice as TerminalTheme) ? [choice as TerminalTheme] : [toolbarTheme(ctx)]

/**
 * The story draws its own panes: the toolbar's frame around it steps aside, and
 * drops its terminal theme class, whose variables would otherwise reach the
 * panes inside it.
 */
const stepAside = (host: HTMLElement) =>
  setTimeout(() => {
    const frame = host.closest('.pane') as HTMLElement | null
    const body = host.closest('.body') as HTMLElement | null
    if (frame) {
      frame.className = 'pane'
      frame.style.cssText = 'background:none;padding:0;display:block'
    }
    if (body) body.style.width = 'auto'
  })

/** The mods the sheet draws, each from its own render hook and its busiest scenario. */
const LOOK_MODS = [
  { plugin: 'overview', hooks: collect(overviewMod as any), state: overviewFixtures.busy },
  { plugin: 'issues', hooks: collect(issuesMod as any), state: issuesFixtures.busy },
  { plugin: 'launcher', hooks: collect(launcherMod as any), state: launcherFixtures.busy },
  { plugin: 'filetree', hooks: collect(filetreeMod as any), state: filetreeFixtures.working },
] as const

/** The mods drawn unless the control picks one. */
const LOOK_DEFAULT = ['overview', 'issues', 'launcher']

/**
 * The terminal's look (TERM_ROLES in zen's kit/ui.tsx): overview, issues and
 * launcher, busy, at 40 and 60 columns on the toolbar's terminal theme, so the
 * bold titles, dim labels and the one bold figure per section can be checked
 * against the status colours on each ground. The controls pick another theme or
 * `all` four, one width, or one mod (filetree too), as the screenshots take it.
 */
export const Busy: Story = {
  globals: { frame: 'pane', surface: 'terminal', columns: '110' },
  args: { theme: 'toolbar', width: 'both', mod: 'all' },
  argTypes: {
    theme: { control: 'select', options: ['toolbar', 'all', ...TERMINAL_THEMES] },
    width: { control: 'select', options: ['both', '40', '60'] },
    mod: { control: 'select', options: ['all', ...LOOK_MODS.map(m => m.plugin)] },
  },
  render: (args, ctx) => {
    const themes = pickThemes(args.theme, ctx)
    const widths = args.width === 'both' ? [40, 60] : [Number(args.width)]
    const mods = LOOK_MODS.filter(m => (args.mod === 'all' ? LOOK_DEFAULT.includes(m.plugin) : m.plugin === args.mod))
    const host = document.createElement('div')
    host.style.cssText = 'display:flex;flex-direction:column;gap:24px;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#8e8e93'
    // A redraw that starts while one is still drawing wins.
    let drawing = 0
    const paint = async () => {
      const mine = ++drawing
      const rows: HTMLElement[] = []
      for (const theme of themes) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;gap:18px;align-items:flex-start'
        for (const w of widths) {
          const cell = document.createElement('div')
          cell.style.width = `calc(${w}ch + 24px)`
          const label = document.createElement('div')
          label.style.cssText = 'margin-bottom:4px'
          label.textContent = `${theme} · ${w} columns`
          const pane = document.createElement('div')
          pane.className = terminalPaneClass(theme)
          const body = document.createElement('div')
          body.className = 'body'
          body.style.cssText = `width:${w}ch;overflow:hidden;display:flex;flex-direction:column;gap:1.25em`
          for (const m of mods) {
            for (const tree of await panes(m.hooks as any, 'terminal', w)) {
              if (mine !== drawing) return
              const drawn = draw(tree as Node, 'terminal', fn => fn(), { client: { site: `${ctx.id}-${theme}-${w}-${m.plugin}` } })
              if (drawn) body.append(drawn)
            }
          }
          pane.append(body)
          cell.append(label, pane)
          row.append(cell)
        }
        rows.push(row)
      }
      if (mine === drawing) host.replaceChildren(...rows)
    }
    for (const m of LOOK_MODS) load(m.plugin, m.state as Record<string, unknown>)
    onChange(() => void paint())
    void paint()
    stepAside(host)
    return host
  },
}
