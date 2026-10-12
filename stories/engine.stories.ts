import type { Meta, StoryContext, StoryObj } from '@storybook/html'

import { configureClients } from '../playground/client'
import { collect, messages } from '../playground/host'
import * as lab from '../mods/lab/hooks/register'
import { DESKTOP_REFUSED, GROUPS, experiments } from '../mods/lab/hooks/experiments'
import type { Experiment, Group, Surface } from '../mods/lab/hooks/experiments'
import verdicts from '../mods/lab/verdicts.json'
import { show, where } from './show'

/*
 * The Engine section: what Claude Code's rendering engine lets a mod draw, one
 * story per group of the lab mod's experiments (mods/lab). Each experiment shows
 * the engine's verdict on every surface (from `claude plugin test plugins/lab`,
 * mods/lab/verdicts.json), what was seen when it was drawn in the desktop app,
 * and the drawing itself through the bench's emulator.
 *
 * The verdict is the engine's; the drawing below it is the bench's, which is an
 * emulator: where the two disagree, the desktop app is right.
 */

// Client experiments run their surface modules from the lab, and post back to its hooks.
configureClients({ from: 'mods/lab/hooks/register.tsx', post: messages(collect(lab as any)) })

/** The elements a lab experiment draws with: the tags, as the bench's engine resolves them. */
const ELEMENTS = Object.fromEntries(['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Svg', 'Client', 'Raster', 'Image'].map(n => [n, n]))

type Verdict = { accepted: boolean; note: string }
const verdictOf = (id: string) => (verdicts as Record<string, Record<Surface, Verdict>>)[id]

/**
 * What each experiment did when drawn in the desktop app (`/lab gallery`), by
 * eye. Absent: not checked yet.
 */
const PAINT: Record<string, string> = {}

const SURFACE_ORDER: Surface[] = ['desktop', 'terminal', 'vscode', 'mobile']

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string) => {
  const e = document.createElement(tag)
  e.setAttribute('style', style)
  if (text !== undefined) e.textContent = text
  return e
}

/** A surface's verdict as a small chip: ✓ accepted, ✕ refused; the engine's note on hover. */
const chip = (surface: Surface, v: Verdict | undefined) => {
  const ok = v?.accepted
  const c = el(
    'span',
    `font: 11px/16px -apple-system, system-ui, sans-serif; padding: 0 6px; border-radius: 4px; margin-right: 4px; white-space: nowrap;` +
      (v === undefined ? 'color: #8e8e93; background: rgba(128,128,128,.15);' : ok ? 'color: #5bc08a; background: rgba(91,192,138,.14);' : 'color: #e5636f; background: rgba(229,99,111,.14);'),
    `${v === undefined ? '?' : ok ? '✓' : '✕'} ${surface}`,
  )
  if (v) c.title = v.note
  return c
}

/** One experiment: its title, question, verdicts and what was seen, then its drawing. */
const card = (x: Experiment, ctx: StoryContext) => {
  const { surface } = where(ctx)
  const v = verdictOf(x.id)
  const box = el('div', 'margin: 0 0 22px; max-width: 100%;')
  const head = el('div', 'font: 12.5px/18px -apple-system, system-ui, sans-serif; margin-bottom: 6px;')
  head.append(el('div', 'font-weight: 600;', x.title), el('div', 'opacity: .6;', `${x.id} — ${x.question}`))
  const chips = el('div', 'margin: 4px 0;')
  for (const s of SURFACE_ORDER) chips.append(chip(s, v?.[s]))
  head.append(chips)
  const seen = PAINT[x.id]
  head.append(el('div', `font-size: 11.5px; ${seen ? '' : 'opacity: .5;'}`, seen ? `In the desktop app: ${seen}` : 'In the desktop app: not checked yet'))
  box.append(head)

  // Refused by the engine on this surface: the engine would draw its own instead, so the bench shows the reason.
  const here = v?.[surface]
  if (here && !here.accepted) {
    box.append(el('div', 'font-size: 12px; color: #e5636f;', `Refused on ${surface}: ${here.note}`))
    return box
  }
  let tree: unknown
  try {
    tree = x.draw(ELEMENTS, surface)
  } catch (err) {
    box.append(el('div', 'font-size: 12px; color: #e5636f;', `Throws while built: ${(err as Error).message}`))
    return box
  }
  box.append(show(tree, ctx))
  return box
}

const meta: Meta = {
  title: 'Engine',
  // The lab draws each experiment in its own pane; its index pane is titled Lab.
  parameters: { paneTitle: 'Lab', docs:{ description: { component: 'What the rendering engine accepts, from the lab mod.' } } },
}
export default meta

const group = (g: Group): StoryObj => ({
  name: g,
  render: (_, ctx) => {
    const host = el('div', '')
    for (const x of experiments.filter(e => e.group === g)) host.append(card(x, ctx))
    return host
  },
})

/** Every experiment as one table: the engine's verdict per surface, and what the desktop app showed. */
export const Verdicts: StoryObj = {
  render: () => {
    const table = el('table', 'border-collapse: collapse; font: 12px/18px -apple-system, system-ui, sans-serif;')
    const tr = (cells: (string | HTMLElement)[], headRow = false) => {
      const r = el('tr', '')
      for (const c of cells) {
        const td = el(headRow ? 'th' : 'td', 'text-align: left; padding: 3px 10px 3px 0; vertical-align: top; border-bottom: 1px solid rgba(128,128,128,.2);')
        td.append(c)
        r.append(td)
      }
      return r
    }
    table.append(tr(['Group', 'Experiment', ...SURFACE_ORDER, 'Desktop app'], true))
    for (const g of GROUPS)
      for (const x of experiments.filter(e => e.group === g)) {
        const v = verdictOf(x.id)
        table.append(tr([g, x.id, ...SURFACE_ORDER.map(s => chip(s, v?.[s])), PAINT[x.id] ?? (DESKTOP_REFUSED.includes(x.id) ? 'refused' : '–')]))
      }
    return table
  },
}

export const Graphics = group('Graphics')
export const Animation = group('Animation')
export const Interaction = group('Interaction')
export const Layout = group('Layout')
export const Text = group('Text')
export const Elements = group('Elements')
