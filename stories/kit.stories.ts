import type { Meta, StoryObj } from '@storybook/html'

import { tokens } from '@kit/format'
import { TERM_GLYPH } from '@kit/icons'
import type { PerfRow } from '@kit/perf'
import { C, GLYPH, INK, RAMP, STATUS, levelColor } from '@kit/tokens'
import type { StatusKind } from '@kit/tokens'
import { TERM_LOOKS, kit, setTermLook } from '@kit/ui'
import type { TermLook } from '@kit/ui'

import * as issuesMod from '../mods/issues/hooks/register'
import * as launcherMod from '../mods/launcher/hooks/register'
import * as overviewMod from '../mods/overview/hooks/register'
import { load, onChange } from '../playground/engine'
import * as issuesFixtures from '../playground/fixtures/issues'
import * as launcherFixtures from '../playground/fixtures/launcher'
import * as overviewFixtures from '../playground/fixtures/overview'
import { collect, panes } from '../playground/host'
import { CELL, draw, h } from '../playground/render'
import type { Node, Surface } from '../playground/render'
import { kitFor, show } from './show'

type Args = Record<string, any>

const meta: Meta<Args> = { title: 'Kit' }
export default meta

type Story = StoryObj<Args>

export const Bar: Story = {
  args: { a: 30, b: 15, c: 8, max: 100, height: 0.45 },
  argTypes: { height: { control: { type: 'range', min: 0.2, max: 1.5, step: 0.05 } } },
  render: (args, ctx) =>
    show(
      kitFor(ctx).bar(
        [
          { value: args.a, color: RAMP.slate[0] },
          { value: args.b, color: RAMP.slate[1] },
          { value: args.c, color: C.blue },
        ],
        args.max,
        { height: args.height },
      ),
      ctx,
    ),
}

/** A section with readings: label, gauge, figure, unit, in the kit's fixed columns. */
export const Section: Story = {
  args: { title: 'Limits', collapsible: true, collapsed: false, fiveHour: 42, weekly: 81 },
  render: (args, ctx) => {
    let collapsed = args.collapsed as boolean
    const host = document.createElement('div')
    const paint = () => {
      const k = kitFor(ctx)
      const tree = k.section({
        id: 'demo',
        icon: GLYPH.limits,
        title: args.title,
        right: k.summary([['2', 'windows']]),
        collapsed,
        ...(args.collapsible ? { onToggle: () => (collapsed = !collapsed) } : {}),
        children: [
          k.reading('5h', { label: '5-hour', value: args.fiveHour, max: 100, color: levelColor(args.fiveHour), figure: `${args.fiveHour}%`, unit: '2h18' }),
          k.reading('wk', { label: 'Weekly', value: args.weekly, max: 100, color: levelColor(args.weekly), figure: `${args.weekly}%`, unit: '3d4h' }),
        ],
      })
      host.replaceChildren(show(tree, ctx, paint))
    }
    paint()
    return host
  },
}

/** The two ways to round on the desktop; see the notes above `cap` in kit/ui.tsx. */
export const Rounding: Story = {
  args: { fill: '#272727', height: 0.45 },
  argTypes: { fill: { control: 'color' }, height: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } } },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const flat = (color: string) => (rows: number | undefined) => h('Box', { flexGrow: 1, height: rows, backgroundColor: color })
    return show(
      h(
        'Box',
        { flexDirection: 'column', rowGap: 0.8 },
        k.rounded(args.fill, { paddingX: 1, paddingY: 0.2 }, h('Text', { bold: true }, 'rounded: a solid fill, a row or more tall')),
        k.capped(args.height, INK, INK, flat(INK)),
        k.bar([{ value: 45, color: INK }, { value: 15, color: C.blue }], 100, { height: args.height }),
      ),
      ctx,
    )
  },
}

/** A legend in two columns, and a header summary. */
export const Legend: Story = {
  render: (_, ctx) => {
    const k = kitFor(ctx)
    return show(
      h(
        'Box',
        { flexDirection: 'column', rowGap: 1 },
        k.summary([['28%', 'of 1M'], ['3', 'failed', C.bad]]),
        k.legend('demo', [
          { label: 'System', color: RAMP.slate[0], figure: tokens(5_300) },
          { label: 'Tools', color: RAMP.slate[1], figure: tokens(29_700) },
          { label: 'MCP', color: RAMP.slate[2], figure: tokens(20_500) },
          { label: 'Memory', color: RAMP.slate[3], figure: tokens(9_500) },
          { label: 'Messages', color: C.blue, figure: tokens(207_000) },
        ]),
      ),
      ctx,
    )
  },
}

/** Stacked columns on a baseline, with labels under their columns. */
export const Columns: Story = {
  args: { turns: 11, slots: 16 },
  argTypes: { turns: { control: { type: 'range', min: 1, max: 16 } } },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const n = args.turns as number
    const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, xs) => xs.indexOf(v) === i)
    return show(
      h(
        'Box',
        { flexDirection: 'column' },
        k.columns(
          Array.from({ length: n }, (_, i) => [
            { value: 1 + (i % 3), color: RAMP.slate[1] },
            { value: 2 + ((i * 5) % 7), color: RAMP.blue[1] },
            { value: 3 + ((i * 3) % 9), color: RAMP.blue[0] },
          ]),
          { slots: args.slots, height: 3.5 },
        ),
        k.axis(
          'demo',
          ticks.map(i => ({ at: (i + 0.5) / args.slots, text: String(i + 1).padStart(2, '0') })),
        ),
      ),
      ctx,
    )
  },
}

const row = (name: string, avgMs: number, perMin: number): PerfRow => ({
  name,
  n: perMin * 12,
  perMin,
  avgMs,
  lastMs: avgMs,
  maxMs: avgMs * 2,
  busyMs: avgMs * perMin,
})

// ---- The terminal beside the desktop, at several widths ----

/** The widths each sheet draws the terminal at, in cells. */
const WIDTHS = [30, 40, 60, 100]

type K = ReturnType<typeof kit>

/**
 * A sheet: what `build` draws, on the terminal at 30, 40, 60 and 100 columns,
 * each beside the desktop (dark) at the same width. Whatever the toolbar says:
 * the point is the comparison. Buttons redraw every copy.
 */
const sheet = (build: (k: K, surface: Surface, columns: number) => unknown): Story => ({
  globals: { frame: 'pane', surface: 'terminal', columns: '110' },
  render: (_, ctx) => {
    const host = document.createElement('div')
    host.style.cssText = 'display:flex;flex-direction:column;gap:18px;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#8e8e93'
    const paint = () => {
      host.replaceChildren(
        ...WIDTHS.map(w => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start'
          for (const surface of ['terminal', 'desktop'] as const) {
            const cell = document.createElement('div')
            const label = Object.assign(document.createElement('div'), { textContent: `${surface} · ${w} columns` })
            label.style.marginBottom = '4px'
            const pane = document.createElement('div')
            pane.className = `pane ${surface === 'terminal' ? 'terminal' : 'dark'}`
            const body = document.createElement('div')
            body.className = 'body'
            body.style.width = surface === 'terminal' ? `${w}ch` : `${w * CELL.col}px`
            body.style.overflow = 'hidden'
            const Svg = surface === 'terminal' ? undefined : ('Svg' as any)
            const k = kit({ Box: 'Box' as any, Text: 'Text' as any, Button: 'Button' as any, Svg }, surface, w)
            const drawn = draw(build(k, surface, w) as Node, surface, fn => (fn(), paint()), { client: { site: `${ctx.id}-${surface}-${w}` } })
            if (drawn) body.append(drawn)
            pane.append(body)
            cell.append(label, pane)
            row.append(cell)
          }
          return row
        }),
      )
    }
    paint()
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

/** Folds kept across redraws, per sheet. */
const folded = new Set<string>(['servers'])
const toggle = (id: string) => () => (folded.has(id) ? folded.delete(id) : folded.add(id))

const AT = Date.UTC(2026, 9, 11, 12)

/** Every primitive in one pane, as a mod would put them together. */
export const TerminalInspector = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.item('head', { text: 'awesome-claude', dim: true, right: [k.summary([['2', 'running', C.ok], ['1', 'failed', C.bad]])] }),
    h('Box', { height: 1 }),
    k.section({
      id: 'limits',
      icon: GLYPH.limits,
      title: 'Limits',
      right: k.summary([['3', 'windows']]),
      collapsed: folded.has('limits'),
      onToggle: toggle('limits'),
      children: [
        k.reading('5h', { label: '5-hour', value: 42, max: 100, color: levelColor(42), figure: '42%', unit: '2h18' }),
        k.reading('wk', { label: 'Weekly', value: 81, max: 100, color: levelColor(81), figure: '81%', unit: '3d4h' }),
        k.reading('sp', { label: 'Spend', value: 93, max: 100, color: levelColor(93), figure: '93%', unit: '$46' }),
      ],
    }),
    k.section({
      id: 'context',
      icon: GLYPH.context,
      title: 'Context',
      right: k.summary([['28%', 'of 1M']]),
      collapsed: folded.has('context'),
      onToggle: toggle('context'),
      children: [
        k.bar(
          [
            { value: 5_300, color: RAMP.slate[0] },
            { value: 29_700, color: RAMP.slate[1] },
            { value: 20_500, color: RAMP.slate[2] },
            { value: 207_000, color: C.blue },
          ],
          1_000_000,
        ),
        k.scale(0.8),
        k.legend('ctx', [
          { label: 'System', color: RAMP.slate[0], figure: tokens(5_300) },
          { label: 'Tools', color: RAMP.slate[1], figure: tokens(29_700) },
          { label: 'MCP', color: RAMP.slate[2], figure: tokens(20_500) },
          { label: 'Messages', color: C.blue, figure: tokens(207_000) },
        ]),
      ],
    }),
    k.section({
      id: 'tasks',
      icon: GLYPH.agents,
      title: 'Tasks',
      right: k.summary([['1', 'running', C.blue], ['2', 'done']]),
      collapsed: folded.has('tasks'),
      onToggle: toggle('tasks'),
      children: [
        k.item('t1', { lead: 'running', text: 'Restyle the terminal kit', note: '4m · 38k', right: ['2 sub'] }),
        k.item('t2', { tree: k.tree([], false), lead: 'done', text: 'Survey the mods’ terminal code', note: '1m' }),
        k.item('t3', { tree: k.tree([], true), lead: 'failed', text: 'Screenshot the stories at every width', note: '12s' }),
        k.item('t4', { lead: 'pending', text: 'Write the Terminal section of mod-authoring', dim: true }),
      ],
    }),
    k.section({
      id: 'servers',
      icon: GLYPH.layers,
      title: 'storybook',
      right: h(
        'Box',
        { flexDirection: 'row', gap: k.space.item, minWidth: 0, flexShrink: 1 },
        k.status('running', 'running'),
        k.actions('acts', [
          { key: 'stop', label: 'Stop', onPress: () => undefined },
          { key: 'restart', label: 'Restart', onPress: () => undefined, quiet: true },
        ]),
      ),
      collapsed: folded.has('servers'),
      onToggle: toggle('servers'),
      children: [k.prop('cmd', 'command', 'bun run storybook --port 6006 --no-open --ci'), k.prop('cwd', 'cwd', '.'), k.prop('exit', 'exit', h('Text', k.ink(C.bad), '1'))],
    }),
    k.section({
      id: 'activity',
      icon: GLYPH.time,
      title: 'Activity',
      right: k.summary([['11', 'turns']]),
      collapsed: folded.has('activity'),
      onToggle: toggle('activity'),
      children: [
        k.columns(
          Array.from({ length: 11 }, (_, i) => [
            { value: 1 + (i % 3), color: RAMP.slate[1] },
            { value: 3 + ((i * 3) % 9), color: C.blue },
          ]),
          { slots: 16, height: 2.5 },
        ),
      ],
    }),
    k.note('none', 'No open pull requests.'),
    k.note('err', 'gh: could not reach api.github.com (HTTP 502)', 'error'),
  ),
)

/** Readings: label, gauge, figure, unit, in fixed columns; the gauge gives way first. */
export const TerminalReadings = sheet(k =>
  k.section({
    id: 'r',
    icon: GLYPH.limits,
    title: 'Readings',
    right: k.summary([['0–100', '%']]),
    children: [0, 3, 42, 74, 75, 89, 90, 100].map(v =>
      k.reading(`r${v}`, { label: `at ${v}%`, value: v, max: 100, color: levelColor(v), figure: `${v}%`, unit: v >= 90 ? 'full' : 'ok', unitColor: v >= 90 ? C.bad : undefined }),
    ),
  }),
)

/** Bars and gauges at sub-cell precision, and a scale with its marker. */
export const TerminalBars = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.caption('gauge, by halves'),
    ...[0.5, 1, 1.5, 2, 2.5, 50, 99].map(v => k.gauge(v, 100, INK)),
    k.caption('bar, by eighths'),
    ...[0.4, 1, 2, 3, 12.5, 50].map(v => k.bar([{ value: v, color: INK }], 100)),
    k.caption('stacked'),
    k.bar(
      [
        { value: 12, color: RAMP.slate[0] },
        { value: 9, color: RAMP.slate[1] },
        { value: 30, color: C.blue },
        { value: 7, color: C.warn },
      ],
      100,
    ),
    k.scale(0.83),
  ),
)

/** Lists: rows with a lead mark, tree connectors, notes, figures on the right; rails. */
export const TerminalLists = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.item('a', { lead: 'issue-opened', leadColor: C.ok, text: 'The terminal versions of all our mods need love', right: ['#31', '2d'] }),
    k.item('b', { lead: 'pr-open', leadColor: C.blue, text: 'kit: a terminal design system', note: 'dev', right: [k.status('pending', '2 pending')] }),
    k.item('c', { lead: 'pr-merged', leadColor: C.purple, text: 'launcher: manage the dev servers', right: ['#27'] }),
    k.item('d', { lead: 'folder-open', text: 'kit', bold: true }),
    k.item('e', { tree: k.tree([], false), lead: 'file', text: 'tokens.ts', right: ['+48'] }),
    k.item('f', { tree: k.tree([], false), lead: 'file', text: 'ui.tsx', right: ['+310'] }),
    k.item('g', { tree: k.tree([], true), lead: 'folder', text: 'stories' }),
    k.rail('rail', { color: C.blue, text: 'feat/terminal-kit', note: '3 ahead', figures: ['+412', '−96'] }),
  ),
)

/** Every status mark and every icon's terminal glyph. */
export const TerminalGlyphs = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.caption('statuses'),
    ...(Object.keys(STATUS) as StatusKind[]).map(s => k.item(s, { lead: s, text: s })),
    k.caption('icons'),
    ...[...Object.values(GLYPH), ...Object.keys(TERM_GLYPH)].map(key => k.item(`i-${key}`, { lead: key, text: key })),
  ),
)

/** Actions, empty, loading and error lines, a pill, a summary that runs out of room. */
export const TerminalStates = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.item('srv', {
      lead: 'failed',
      text: 'api',
      right: [
        h('Text', k.ink(C.bad), 'failed'),
        k.actions('a', [
          { key: 'start', label: 'Start', onPress: () => undefined },
          { key: 'logs', label: 'Logs', onPress: () => undefined, quiet: true },
        ]),
      ],
    }),
    // Proceed destroys something (red); Cancel holds the focus, so Enter refuses.
    k.actions('answer', [
      { key: 'proceed', label: 'Proceed', hotkey: '1', tone: 'danger', onPress: () => undefined },
      { key: 'cancel', label: 'Cancel', hotkey: '2', autoFocus: true, onPress: () => undefined },
    ]),
    k.note('loading', 'Reading pull requests…', 'loading'),
    k.note('empty', 'No subagents yet.'),
    k.note('error', 'gh is not signed in: run gh auth login, then /issues again', 'error'),
    k.note('two', 'Could not measure: bash exited 2 while expanding the paths, so nothing is listed here.', 'empty', { lines: 2 }),
    k.note('two-err', 'gh is not signed in: run gh auth login, then /issues again to read them', 'error', { lines: 2 }),
    h('Box', { flexDirection: 'row', gap: k.space.pair }, k.pill('p1', 'bug', '#d73a4a'), k.pill('p2', 'refined', C.ok)),
    k.summary([['207k', 'tokens'], ['28%', 'of 1M'], ['3', 'failed', C.bad], ['12', 'agents']]),
    k.perf({ sinceMs: 12 * 60_000, rows: [row('git', 38, 4), row('render', 2.1, 9), row('gh', 900, 3)] }),
  ),
)

/**
 * What gives way when a row runs out of room: a header whose controls must all
 * show (`keepRight`) beside one whose title and figures share the cut; an item's
 * note plain dim beside a coloured bold text; an item's right cluster cut last.
 */
export const TerminalFitting = sheet(k => {
  const buttons = k.actions('tools', [
    { key: 'up', label: '↑', quiet: true, onPress: () => undefined },
    { key: 'home', label: '⌂', onPress: () => undefined },
    { key: 'sync', label: '↻', quiet: true, onPress: () => undefined },
    { key: 'hidden', label: '○', quiet: true, onPress: () => undefined },
    { key: 'size', label: 'Σ', quiet: true, onPress: () => undefined },
    { key: 'fold', label: '⊟', quiet: true, onPress: () => undefined },
  ])
  return h(
    'Box',
    { flexDirection: 'column' },
    k.caption('keepRight'),
    k.section({ id: 'keep', title: 'awesome-claude-with-a-long-folder-name/kit', right: buttons, keepRight: true, collapsed: true, onToggle: () => undefined, children: null }),
    k.caption('title and figures'),
    k.section({
      id: 'share',
      icon: GLYPH.tools,
      title: 'Activity across the session',
      right: k.summary([['14', 'peak'], ['4', 'failed', C.bad], ['93%', 'cached']]),
      collapsed: true,
      onToggle: () => undefined,
      children: null,
    }),
    k.caption('note after colour'),
    k.item('branch', { lead: GLYPH.branch, text: 'feat/terminal-kit', textColor: C.blue, bold: true, note: '↑3 ↓1 origin/feat/terminal-kit', right: ['clean'] }),
    k.caption('right cluster'),
    k.item('long-right', {
      lead: 'failed',
      text: 'storybook',
      right: [k.status('failed', 'failed'), 'localhost:6006', k.actions('a', [{ key: 'start', label: 'Start', onPress: () => undefined }])],
    }),
    k.item('long-figures', { lead: 'file', text: 'kit/ui.tsx', right: ['+310', '−96', 'modified 2 minutes ago by Claude'] }),
  )
})

export const PerfFooter: Story = {
  args: { gitMs: 38, gitPerMin: 4, renderMs: 2.1, rendersPerMin: 9, ghMs: 900, ghPerMin: 3 },
  render: (args, ctx) => {
    const rows = [
      row('git', args.gitMs, args.gitPerMin),
      row('render', args.renderMs, args.rendersPerMin),
      row('gh', args.ghMs, args.ghPerMin),
      row('tool.call', 0.3, 40),
    ].sort((a, b) => b.busyMs - a.busyMs)
    return show(kitFor(ctx).perf({ sinceMs: 12 * 60_000, rows }), ctx)
  },
}

// ---- The terminal's design directions, side by side ----

/** The looks, today's first. */
const LOOKS = Object.keys(TERM_LOOKS) as TermLook[]

/** The mods the directions sheet draws, each from its own render hook and its busy scenario. */
const DIRECTION_MODS = [
  { plugin: 'overview', hooks: collect(overviewMod as any), state: overviewFixtures.busy },
  { plugin: 'issues', hooks: collect(issuesMod as any), state: issuesFixtures.busy },
  { plugin: 'launcher', hooks: collect(launcherMod as any), state: launcherFixtures.busy },
] as const

/** A dark and a light terminal: the pane's ground and text, which inverse bands swap. */
const TERMINAL_THEMES = {
  dark: { bg: '#101014', fg: '#d8d8d8' },
  light: { bg: '#fbfbf9', fg: '#1d1d1f' },
} as const

/**
 * The same content (overview, issues and launcher, busy) in each terminal look
 * (TERM_LOOKS in kit/ui.tsx), side by side at 40 and 60 columns, on a dark and a
 * light terminal. The controls narrow it to one look, theme, width or mod, as the
 * screenshots take it.
 */
export const TerminalDirections: Story = {
  globals: { frame: 'pane', surface: 'terminal', columns: '110' },
  args: { look: 'all', theme: 'both', width: 'both', mod: 'all' },
  argTypes: {
    look: { control: 'select', options: ['all', ...LOOKS] },
    theme: { control: 'select', options: ['both', 'dark', 'light'] },
    width: { control: 'select', options: ['both', '40', '60'] },
    mod: { control: 'select', options: ['all', ...DIRECTION_MODS.map(m => m.plugin)] },
  },
  render: (args, ctx) => {
    const looks = args.look === 'all' ? LOOKS : [args.look as TermLook]
    const themes = (args.theme === 'both' ? ['dark', 'light'] : [args.theme]) as (keyof typeof TERMINAL_THEMES)[]
    const widths = args.width === 'both' ? [40, 60] : [Number(args.width)]
    const mods = DIRECTION_MODS.filter(m => args.mod === 'all' || m.plugin === args.mod)
    const host = document.createElement('div')
    host.style.cssText = 'display:flex;flex-direction:column;gap:24px;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#8e8e93'
    // A redraw that starts while one is still drawing wins; the look is a module setting, so they mustn't interleave.
    let drawing = 0
    const paint = async () => {
      const mine = ++drawing
      const rows: HTMLElement[] = []
      try {
        for (const theme of themes) {
          for (const w of widths) {
            const row = document.createElement('div')
            row.style.cssText = 'display:flex;gap:18px;align-items:flex-start'
            for (const look of looks) {
              const cell = document.createElement('div')
              cell.style.width = `calc(${w}ch + 24px)`
              const label = document.createElement('div')
              label.style.cssText = 'margin-bottom:4px;white-space:normal'
              label.innerHTML = `<b style="color:inherit">${look}</b> · ${theme} · ${w} columns<br>${TERM_LOOKS[look].about}`
              const pane = document.createElement('div')
              pane.className = 'pane terminal'
              const t = TERMINAL_THEMES[theme]
              pane.style.background = t.bg
              pane.style.color = t.fg
              pane.style.setProperty('--r-bg', t.bg)
              pane.style.setProperty('--r-fg', t.fg)
              const body = document.createElement('div')
              body.className = 'body'
              body.style.cssText = `width:${w}ch;overflow:hidden;display:flex;flex-direction:column;gap:1.25em`
              setTermLook(look)
              for (const m of mods) {
                for (const tree of await panes(m.hooks as any, 'terminal', w)) {
                  if (mine !== drawing) return
                  const drawn = draw(tree as Node, 'terminal', fn => fn(), { client: { site: `${ctx.id}-${look}-${theme}-${w}-${m.plugin}` } })
                  if (drawn) body.append(drawn)
                }
              }
              pane.append(body)
              cell.append(label, pane)
              row.append(cell)
            }
            rows.push(row)
          }
        }
      } finally {
        // Everything else draws in the default look.
        setTermLook('inspector')
      }
      if (mine === drawing) host.replaceChildren(...rows)
    }
    for (const m of DIRECTION_MODS) load(m.plugin, m.state as Record<string, unknown>)
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
}
