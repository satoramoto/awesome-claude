import type { Meta, StoryObj } from '@storybook/html'

import { tokens } from '@kit/format'
import { TERM_GLYPH } from '@kit/icons'
import type { PerfRow } from '@kit/perf'
import { C, GLYPH, INK, RAMP, STATUS, levelColor } from '@kit/tokens'
import type { StatusKind } from '@kit/tokens'
import { kit } from '@kit/ui'
import type { KitOptions } from '@kit/ui'

import * as filetreeMod from '../mods/filetree/hooks/register'
import * as issuesMod from '../mods/issues/hooks/register'
import * as launcherMod from '../mods/launcher/hooks/register'
import * as overviewMod from '../mods/overview/hooks/register'
import { load, onChange } from '../playground/engine'
import * as filetreeFixtures from '../playground/fixtures/filetree'
import * as issuesFixtures from '../playground/fixtures/issues'
import * as launcherFixtures from '../playground/fixtures/launcher'
import * as overviewFixtures from '../playground/fixtures/overview'
import { collect, panes } from '../playground/host'
import { CELL, TERMINAL_THEMES, draw, h, terminalPaneClass } from '../playground/render'
import type { Node, Surface, TerminalTheme } from '../playground/render'
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

/** The toolbar's terminal theme (dark when it names none). */
const toolbarTheme = (ctx: { globals: Record<string, any> }): TerminalTheme => {
  const t = String(ctx.globals.theme ?? 'dark') as TerminalTheme
  return TERMINAL_THEMES.includes(t) ? t : 'dark'
}

/** The terminal themes a sheet's `theme` control picks: the toolbar's, one, or `all` four. */
const pickThemes = (choice: unknown, ctx: { globals: Record<string, any> }): TerminalTheme[] =>
  choice === 'all' ? [...TERMINAL_THEMES] : TERMINAL_THEMES.includes(choice as TerminalTheme) ? [choice as TerminalTheme] : [toolbarTheme(ctx)]

/** The `theme` control of a sheet: follow the toolbar, one theme, or all four. */
const THEME_CONTROL = {
  args: { theme: 'toolbar' },
  argTypes: { theme: { control: 'select', options: ['toolbar', ...TERMINAL_THEMES, 'all'] } },
}

/**
 * The sheet draws its own panes: the toolbar's frame around it steps aside, and
 * drops its terminal theme class, whose variables would otherwise reach the
 * panes inside it (the desktop's and other terminal themes').
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

/** A kit for `surface` at `columns`, as the engine hands one to a hook. */
const kitAt = (surface: Surface, columns: number, opts: KitOptions = {}) =>
  kit({ Box: 'Box' as any, Text: 'Text' as any, Button: 'Button' as any, Svg: surface === 'terminal' ? undefined : ('Svg' as any) }, surface, columns, opts)

/** What a sheet's `build` gets besides the kit: a kit at the same surface and width with other options (`{ focused: false }`). */
type More = { make: (opts: KitOptions) => K }

/**
 * A sheet: what `build` draws, on the terminal at 30, 40, 60 and 100 columns
 * (or `widths`), each beside the desktop at the same width. The terminal follows
 * the toolbar's Theme (the `theme` control picks one, or `all` four side by
 * side); the desktop draws in that theme's light or dark look. Whatever the
 * toolbar's surface: the point is the comparison. Buttons redraw every copy.
 */
const sheet = (build: (k: K, surface: Surface, columns: number, more: More) => unknown, opts: { widths?: number[] } = {}): Story => ({
  globals: { frame: 'pane', surface: 'terminal', columns: '110' },
  ...THEME_CONTROL,
  render: (args, ctx) => {
    const themes = pickThemes(args.theme, ctx)
    const desktop = (args.theme === 'all' ? toolbarTheme(ctx) : themes[0]!).replace(/-ansi$/, '')
    const host = document.createElement('div')
    host.style.cssText = 'display:flex;flex-direction:column;gap:18px;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#8e8e93'
    const paint = () => {
      host.replaceChildren(
        ...(opts.widths ?? WIDTHS).map(w => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start'
          const panesAt = [...themes.map(theme => ({ surface: 'terminal' as const, theme: theme as string })), { surface: 'desktop' as const, theme: desktop }]
          for (const { surface, theme } of panesAt) {
            const cell = document.createElement('div')
            const label = Object.assign(document.createElement('div'), { textContent: `${surface} · ${theme} · ${w} columns` })
            label.style.marginBottom = '4px'
            const pane = document.createElement('div')
            pane.className = surface === 'terminal' ? terminalPaneClass(theme as TerminalTheme) : `pane ${theme}`
            const body = document.createElement('div')
            body.className = 'body'
            body.style.width = surface === 'terminal' ? `${w}ch` : `${w * CELL.col}px`
            body.style.overflow = 'hidden'
            const tree = build(kitAt(surface, w), surface, w, { make: o => kitAt(surface, w, o) })
            const drawn = draw(tree as Node, surface, fn => (fn(), paint()), { client: { site: `${ctx.id}-${surface}-${theme}-${w}` } })
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
    stepAside(host)
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

const FILES = [
  { name: 'tokens.ts', diff: '+48' },
  { name: 'ui.tsx', diff: '+310' },
  { name: 'icons.ts', diff: '+6' },
  { name: 'format.ts', diff: '−2' },
]

/**
 * A list that takes the keyboard, with its second row selected: while the pane
 * is focused (`▌` and bold) and while it isn't (dim mark, plain weight). Then
 * tiles: selected focused, selected unfocused, and not selected.
 */
export const TerminalSelection = sheet((k, _, __, { make }) => {
  const blurred = make({ focused: false })
  const list = (kk: K, id: string) => FILES.map((f, i) => kk.item(`${id}-${i}`, { lead: 'file', text: f.name, selected: i === 1, right: [f.diff] }))
  const tileBody = (kk: K, id: string, text: string) => [kk.item(`${id}-i`, { lead: 'running', text, note: '4m', right: ['38k'] })]
  return h(
    'Box',
    { flexDirection: 'column' },
    k.caption('focused'),
    ...list(k, 'f'),
    k.caption('unfocused'),
    ...list(blurred, 'u'),
    k.caption('tiles'),
    k.tile('t-sel', tileBody(k, 't-sel', 'Selected, focused'), { selected: true }),
    k.tile('t-blur', tileBody(k, 't-blur', 'Selected, unfocused'), { selected: true, focused: false }),
    k.tile('t-plain', tileBody(k, 't-plain', 'Not selected'), {}),
  )
})

const HINTS = [
  { key: '↑↓', label: 'move' },
  { key: 'enter', label: 'open' },
  { key: 'o', label: 'browser' },
  { key: 'r', label: 'refresh' },
  { key: '/', label: 'filter' },
  { key: 'esc', label: 'close' },
]

/**
 * Key-hint footers: the full list, cut from the end with `…` as the pane
 * narrows; one long hint cut at the edge; and the unfocused pane, which draws
 * none. The desktop draws none either: its controls are buttons.
 */
export const TerminalHints = sheet((k, _, __, { make }) =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.caption('focused'),
    k.hints('all', HINTS),
    k.caption('first two'),
    k.hints('two', HINTS.slice(0, 2)),
    k.caption('one long hint'),
    k.hints('long', [{ key: 'ctrl+shift+r', label: 'reload every mod in this session from disk' }]),
    k.caption('unfocused'),
    make({ focused: false }).hints('blurred', HINTS) ?? k.note('none', 'nothing drawn'),
  ),
)

/**
 * A header's state before its figures: loading (no figures yet), kept figures
 * with their age, a failed refresh with and without an age, and a folded
 * section that is still loading.
 */
export const TerminalStaleStates = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.section({
      id: 'loading',
      icon: GLYPH.pr,
      title: 'Pull requests',
      right: k.summary([], { loading: true }),
      children: [k.note('reading', 'Reading pull requests…', 'loading')],
    }),
    k.section({
      id: 'aged',
      icon: GLYPH.pr,
      title: 'Issues',
      right: k.summary([['4', 'open'], ['1', 'failing', C.bad]], { age: '2m' }),
      children: [k.item('i1', { lead: 'issue-opened', leadColor: C.ok, text: 'The terminal versions of all our mods need love', right: ['#31'] })],
    }),
    k.section({
      id: 'failed-age',
      icon: GLYPH.limits,
      title: 'Limits',
      right: k.summary([['42%', '5-hour'], ['81%', 'weekly']], { failed: true, age: '5m' }),
      children: [k.reading('5h', { label: '5-hour', value: 42, max: 100, color: levelColor(42), figure: '42%', unit: '2h18' })],
    }),
    k.section({
      id: 'failed',
      icon: GLYPH.context,
      title: 'Context',
      right: k.summary([['28%', 'of 1M']], { failed: true }),
      collapsed: folded.has('failed'),
      onToggle: toggle('failed'),
      children: [k.bar([{ value: 28, color: INK }], 100)],
    }),
    k.section({ id: 'folded-loading', icon: GLYPH.agents, title: 'Tasks', loading: true, collapsed: !folded.has('open-loading'), onToggle: toggle('open-loading'), children: [k.note('tl', 'Reading tasks…', 'loading')] }),
  ),
)

/**
 * What goes first when a row runs out of room: each right part's `drop` rank
 * (the age, then the diff, then the CI mark; the number never), and paths cut
 * in the middle so their end shows, in `item` and in `prop`.
 */
export const TerminalDropOrder = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.caption('drop: age 3, diff 2, ci 1, number never'),
    k.item('pr1', {
      lead: 'pr-open',
      leadColor: C.blue,
      text: 'kit: selection, hints and stale figures',
      right: [{ part: k.status('done', 'passing'), drop: 1 }, { part: '+412 −96', drop: 2 }, { part: '#42' }, { part: '2d', drop: 3 }],
    }),
    k.item('pr2', {
      lead: 'pr-open',
      leadColor: C.blue,
      text: 'issues: keep the list through a failed refresh',
      right: [{ part: k.status('failed', 'failing'), drop: 1 }, { part: '+38 −4', drop: 2 }, { part: '#43' }, { part: '5h', drop: 3 }],
    }),
    k.caption('path: true'),
    k.item('p1', { lead: 'file', text: 'mods/overview/hooks/sections/context/render.tsx', path: true, right: ['+12'] }),
    k.item('p2', { lead: GLYPH.branch, text: 'feat/terminal-kit-selection-and-hints', path: true, textColor: C.blue }),
    k.item('p3', { lead: 'file', text: 'mods/overview/hooks/sections/context/render.tsx', right: ['+12'] }),
    k.caption('prop'),
    k.prop('cwd', 'cwd', '/Users/ryan/Code/satoramoto/awesome-claude/.claude/worktrees/agent-ac393ad64d220a35d', { path: true }),
    k.prop('branch', 'branch', 'lane-kit3/terminal-selection-hints-and-stale', { path: true }),
    k.prop('cmd', 'command', 'bun run storybook --port 6006 --no-open --ci'),
  ),
)

/** A day of requests a minute: a slow rise, a spike, a lull. */
const SERIES = Array.from({ length: 120 }, (_, i) => Math.round(8 + 6 * Math.sin(i / 9) + (i % 37 === 20 ? 22 : 0) + (i > 90 && i < 100 ? -8 : 0) + i / 10))

/** Sparklines: Braille one and two rows tall, the blocks fallback, and a coloured one. The desktop draws each as an SVG line. */
export const TerminalSpark = sheet(k =>
  h(
    'Box',
    { flexDirection: 'column' },
    k.caption('braille, 1 row'),
    k.spark(SERIES),
    k.caption('braille, 2 rows'),
    k.spark(SERIES, { height: 2 }),
    k.caption('blocks'),
    k.spark(SERIES, { glyphs: 'blocks' }),
    k.caption('blocks, 2 rows'),
    k.spark(SERIES, { glyphs: 'blocks', height: 2 }),
    k.caption('blue, max 60, 16 wide'),
    k.spark(SERIES, { color: C.blue, max: 60, width: 16, height: 2 }),
  ),
)

/**
 * Where a fixed colour can't reach the terminal: a multi-part bar in `█`/`▓`
 * with a `bar: true` legend keyed in the same glyphs; GitHub label hexes as
 * swatches with the name in the default foreground; a raw hex text colour. At
 * 24 columns (under MIN_COLUMNS) each section draws its header only.
 */
export const TerminalFallbacks = sheet(
  k =>
    h(
      'Box',
      { flexDirection: 'column' },
      k.section({
        id: 'ctx',
        icon: GLYPH.context,
        title: 'Context',
        right: k.summary([['26%', 'of 1M']]),
        children: [
          k.bar(
            [
              { value: 5_300, color: RAMP.slate[0] },
              { value: 29_700, color: RAMP.slate[1] },
              { value: 20_500, color: C.cyan },
              { value: 207_000, color: C.blue },
            ],
            1_000_000,
          ),
          k.legend(
            'ctx',
            [
              { label: 'System', color: RAMP.slate[0], figure: tokens(5_300) },
              { label: 'Tools', color: RAMP.slate[1], figure: tokens(29_700) },
              { label: 'MCP', color: C.cyan, figure: tokens(20_500) },
              { label: 'Messages', color: C.blue, figure: tokens(207_000) },
            ],
            undefined,
            { bar: true },
          ),
        ],
      }),
      k.section({
        id: 'labels',
        icon: GLYPH.pr,
        title: 'Labels',
        right: k.summary([['4', 'labels']]),
        children: [
          h(
            'Box',
            { flexDirection: 'row', gap: k.space.pair, flexWrap: 'wrap' },
            k.pill('bug', 'bug', '#d73a4a'),
            k.pill('help', 'help wanted', '#fbca04'),
            k.pill('good', 'good first issue', '#7057ff'),
            k.pill('docs', 'docs', '#0075ca'),
          ),
          k.item('hex', { lead: 'issue-opened', leadColor: '#d73a4a', text: 'text in #d73a4a', textColor: '#d73a4a', right: ['#12'] }),
          k.item('orchid', { lead: 'file', leadColor: C.orchid, text: 'text in orchid', textColor: C.orchid }),
        ],
      }),
    ),
  { widths: [24, ...WIDTHS] },
)

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

// ---- The terminal's look (rules), on a dark and a light terminal ----

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
 * The terminal's look (TERM_ROLES in kit/ui.tsx): overview, issues and launcher,
 * busy, at 40 and 60 columns on the toolbar's terminal theme, so the orange
 * titles can be checked against the status colours (amber above all) on each
 * ground. The controls pick another theme or `all` four, one width, or one mod
 * (filetree too), as the screenshots take it.
 */
export const TerminalLook: Story = {
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
