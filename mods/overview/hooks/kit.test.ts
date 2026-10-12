import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { TERM_GLYPH } from '@kit/icons'
import { C, GLYPH, INK, RAMP, STATUS, TREE } from '@kit/tokens'
import { FOLD, MARK, METER, PERF_GLYPH, SPARK, TERM_ROLES, kit } from '@kit/ui'
import type { Kit } from '@kit/ui'

// The kit's own tests. The build copies kit/ into each mod but leaves kit tests
// out, so they live here, in the overview mod, and draw through the engine's test
// kit: a hook beneath the mod answers a Pane the mod doesn't (requestId `kit`)
// with what `build` makes from the kit, and the surface's table checks the tree.

type Drawn = { type?: string; key?: string; props?: Record<string, any>; children?: unknown[] }
const kids = (d: Drawn) => ((d.children ?? d.props?.children ?? []) as unknown[]).flat(Infinity).filter((c): c is Drawn => !!c && typeof c === 'object')
const texts = (d: Drawn): Drawn[] => (d.type === 'Text' ? [d] : []).concat(kids(d).flatMap(texts))
const shown = (d: Drawn): string =>
  ((d.children ?? d.props?.children ?? []) as unknown[])
    .flat(Infinity)
    .map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : c && typeof c === 'object' ? shown(c as Drawn) : ''))
    .join('')
/** Every string the tree carries: Text children and Button labels. */
const strings = (d: Drawn): string[] =>
  [
    ...(d.type === 'Button' && typeof d.props?.label === 'string' ? [d.props.label as string] : []),
    ...((d.children ?? d.props?.children ?? []) as unknown[]).flat(Infinity).filter((c): c is string => typeof c === 'string'),
  ].concat(kids(d).flatMap(strings))

/** Every Text that holds only text: the runs a terminal paints. */
const leaves = (d: Drawn) => texts(d).filter(t => !kids(t).length)

type Draw = (build: (k: Kit) => unknown, o?: { surface?: 'terminal' | 'desktop'; columns?: number; focused?: boolean }) => Promise<Drawn>

/**
 * The kit's pane, hooked beneath the mod before the test first calls `$`: returns
 * `draw`, which draws what `build` makes with the kit on `surface` at `columns`,
 * focused or not, and gives back the drawn tree.
 */
const kitPane = ($: Engine, on: On): Draw => {
  let build: (k: Kit) => unknown = () => null
  on('ui.render', { component: 'Pane', requestId: 'kit' }, async ($$, e) =>
    build(kit($$.ui.resolve(e) as any, e.surface, e.props.bodyColumns, { focused: e.props.isFocused })) as never,
  )
  return (b, o = {}) => {
    build = b
    return mount($, o)
  }
}

const mount = async ($: Engine, o: { surface?: 'terminal' | 'desktop'; columns?: number; focused?: boolean }) => {
  const ui = await $.ui.mount({
    plugin: 'overview',
    surface: o.surface ?? 'terminal',
    component: 'Pane',
    requestId: 'kit',
    props: { title: 'Kit', isFocused: o.focused ?? true, bodyColumns: o.columns ?? 40, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  const tree = (await ui.drawn()) as Drawn
  await ui.unmount()
  return tree
}

/** A character that some terminal draws as an emoji (two cells): Unicode's Emoji property, less the ASCII it includes (digits, # and *). */
const EMOJI = /(?![0-9#*])\p{Emoji}/u
/** The variation selectors: VS15 (text) and VS16 (emoji). The terminal never gets either. */
const SELECTOR = new RegExp(`[${String.fromCharCode(0xfe0e)}${String.fromCharCode(0xfe0f)}]`)

/** Every primitive, as a busy pane puts them together. */
const everything = (k: Kit) => {
  return [
    k.section({
      id: 'context',
      icon: GLYPH.context,
      title: 'Context',
      right: k.summary([['28%', 'of 1M']], { age: '2m' }),
      onToggle: () => undefined,
      children: [
        k.bar([{ value: 5, color: RAMP.slate[0] }, { value: 30, color: RAMP.slate[1] }, { value: 20, color: RAMP.slate[2] }, { value: 40, color: C.blue }], 100),
        k.scale(0.8),
        k.legend('ctx', [{ label: 'System', color: RAMP.slate[0], figure: '5k' }, { label: 'Tools', color: RAMP.slate[1], figure: '30k' }], undefined, { bar: true }),
        k.reading('5h', { label: '5-hour', value: 42, max: 100, color: INK, figure: '42%', unit: '2h18' }),
        k.gauge(50, 100, C.cyan),
        k.columns([[{ value: 2, color: RAMP.blue[1] }, { value: 3, color: C.orchid }]], { slots: 4 }),
        k.spark([1, 4, 2, 8, 5, 7, 3, 9]),
        k.prop('cwd', 'cwd', 'src/kit/hooks/a/very/long/path/view.tsx', { path: true }),
        k.rail('rail', { color: RAMP.slate[3], text: 'feat/x', figures: ['+4'] }),
      ],
    }),
    k.section({
      id: 'tasks',
      icon: GLYPH.agents,
      title: 'Tasks',
      right: k.summary([['1', 'failed', C.bad]], { failed: true, age: '5m' }),
      children: [
        k.item('t1', { lead: 'running', text: 'Restyle the kit', note: '4m', right: [{ part: '2d', drop: 1 }, k.status('done', 'ok')], selected: true }),
        k.item('t2', { lead: 'issue-opened', leadColor: '#d73a4a', text: 'kit/ui.tsx', path: true, selected: false }),
        k.note('n', 'Nothing here.'),
        k.note('e', 'gh failed', 'error'),
      ],
    }),
    k.section({ id: 'loading', title: 'Loading', loading: true, children: null }),
    k.hints('hints', [{ key: '↑↓', label: 'move' }, { key: '⏎', label: 'open' }]),
    k.perf({ sinceMs: 60_000, rows: [] }),
  ]
}

test('every terminal glyph table holds one-cell text glyphs: no emoji, no variation selector', async () => {
  const glyphs: [string, string][] = [
    ...Object.entries(GLYPH).map(([k, g]) => [`GLYPH.${k}`, g] as [string, string]),
    ...Object.entries(STATUS).map(([k, s]) => [`STATUS.${k}`, s.glyph] as [string, string]),
    ...Object.entries(TERM_GLYPH).map(([k, g]) => [`TERM_GLYPH.${k}`, g] as [string, string]),
    ...Object.entries(METER).flatMap(([k, g]) => (Array.isArray(g) ? g.map((x, i) => [`METER.${k}[${i}]`, x] as [string, string]) : [[`METER.${k}`, g as string] as [string, string]])),
    ...Object.entries(FOLD).map(([k, g]) => [`FOLD.${k}`, g] as [string, string]),
    ...Object.entries(TREE).map(([k, g]) => [`TREE.${k}`, g] as [string, string]),
    ...Object.entries(MARK).map(([k, g]) => [`MARK.${k}`, g] as [string, string]),
    ...Object.entries(PERF_GLYPH).map(([k, g]) => [`PERF_GLYPH.${k}`, g] as [string, string]),
    ...SPARK.left.flatMap((l, a) => SPARK.right.map((r, b) => [`SPARK ${a},${b}`, String.fromCharCode(SPARK.base | l | r)] as [string, string])),
  ]
  for (const [name, g] of glyphs) {
    expect(EMOJI.test(g), `${name} ${g} has the Emoji property`).toBe(false)
    expect(SELECTOR.test(g), `${name} carries a variation selector`).toBe(false)
  }
  // Single glyphs are one code point; TREE connectors are two cells, the separator three.
  for (const [name, g] of glyphs.filter(([n]) => !/^(TREE|MARK\.sep|METER\.rise\[0\])/.test(n) && !/^METER\.eighths\[0\]/.test(n))) {
    expect([...g].length, `${name} is one cell`).toBe(1)
  }
})

test('a role is never italic alone: an italic role is also dim or bold', async () => {
  for (const [name, role] of Object.entries(TERM_ROLES)) if (role.italic) expect(Boolean(role.dimColor || role.bold), `${name}`).toBe(true)
})

test('the terminal gets no fixed hex colour and no variation selector from any primitive', async ($, on) => {
  const draw = kitPane($, on)
  for (const columns of [30, 40, 60, 100]) {
    const tree = await draw(k => ({ type: 'Box', props: { flexDirection: 'column' }, children: everything(k) }) as never, { columns })
    for (const t of texts(tree)) {
      for (const prop of ['color', 'backgroundColor'] as const) {
        const c = t.props?.[prop]
        // A label's own colour (data, not a kit token) may tint its one-cell swatch, and nothing else.
        if (typeof c === 'string' && /^(#|rgb|hsl)/i.test(c)) expect(shown(t), `${prop} ${c} at ${columns}`).toBe('■')
      }
    }
    for (const s of strings(tree)) {
      expect(SELECTOR.test(s), `"${s}" at ${columns}`).toBe(false)
      expect(EMOJI.test(s), `"${s}" at ${columns}`).toBe(false)
    }
  }
})

test('quantity and chart shades draw in the default foreground or dim on the terminal', async ($, on) => {
  const draw = kitPane($, on)
  const tree = await draw(k => k.bar([{ value: 25, color: INK }, { value: 25, color: RAMP.slate[1] }, { value: 25, color: C.cyan }, { value: 25, color: C.orchid }], 100, { width: 8 }) as never)
  const runs = texts(tree).filter(t => !kids(t).length)
  expect(runs.map(t => [shown(t), t.props?.color, Boolean(t.props?.dimColor)])).toEqual([
    ['██', undefined, false],
    ['▓▓', undefined, true],
    ['██', undefined, false],
    ['▓▓', undefined, true],
  ])
})

test('a selected row has a suggestion-blue ▌ and bold text; unfocused, the mark dims and the text keeps its weight', async ($, on) => {
  const draw = kitPane($, on)
  const rows = (k: Kit) =>
    ({
      type: 'Box',
      props: { flexDirection: 'column' },
      children: [k.item('a', { text: 'first', selected: true }), k.item('b', { text: 'second', selected: false })],
    }) as never
  const focused = await draw(rows, { focused: true })
  const mark = leaves(focused).find(t => shown(t) === MARK.selected)
  expect(mark?.props).toMatchObject({ color: 'suggestion' })
  expect(mark?.props?.dimColor).toBeFalsy()
  expect(leaves(focused).find(t => shown(t) === 'first')?.props?.bold).toBe(true)
  expect(leaves(focused).find(t => shown(t) === 'second')?.props?.bold).toBeFalsy()
  // Every row of the list keeps the one-cell gutter, so the text lines up.
  expect(leaves(focused).filter(t => shown(t) === ' ')).toHaveLength(1)

  const blurred = await draw(rows, { focused: false })
  expect(leaves(blurred).find(t => shown(t) === MARK.selected)?.props).toMatchObject({ color: 'suggestion', dimColor: true })
  expect(leaves(blurred).find(t => shown(t) === 'first')?.props?.bold).toBeFalsy()
})

test('key hints show only while the pane has the keyboard, and drop from the end with …', async ($, on) => {
  const draw = kitPane($, on)
  const list = [
    { key: '↑↓', label: 'move' },
    { key: '⏎', label: 'open' },
    { key: 'r', label: 'refresh' },
    { key: '/', label: 'search' },
  ]
  const wide = await draw(k => k.hints('h', list) as never, { columns: 60 })
  expect(shown(wide)).toBe('↑↓ move · ⏎ open · r refresh · / search')
  const keys = leaves(wide).filter(t => ['↑↓', '⏎', 'r', '/'].includes(shown(t)))
  expect(keys.every(t => !t.props?.dimColor)).toBe(true)
  expect(leaves(wide).find(t => shown(t) === ' move')?.props?.dimColor).toBe(true)

  const narrow = await draw(k => k.hints('h', list) as never, { columns: 30 })
  expect(shown(narrow)).toBe('↑↓ move · ⏎ open …')

  const away = await draw(k => ({ type: 'Box', props: {}, children: [k.hints('h', list)].filter(Boolean) }) as never, { focused: false })
  expect(shown(away)).toBe('')
})

test('a section shows ◌ while loading, and keeps last-good figures with an amber ▲ and their age when a refresh fails', async ($, on) => {
  const draw = kitPane($, on)
  const loading = await draw(k => k.section({ id: 's', title: 'Issues', loading: true, children: [k.note('n', 'body')] }) as never)
  expect(leaves(loading).find(t => shown(t) === STATUS.pending.glyph)?.props).toMatchObject({ color: 'suggestion' })

  const failed = await draw(k => k.section({ id: 's', title: 'Issues', right: k.summary([['12', 'open']], { failed: true, age: '3m' }), children: null }) as never)
  expect(leaves(failed).find(t => shown(t) === STATUS.warn.glyph)?.props).toMatchObject({ color: 'warning' })
  expect(shown(failed)).toContain('▲ 3m  12 open')

  const stale = await draw(k => k.summary([['12', 'open']], { age: '3m' }) as never)
  expect(shown(stale)).toBe('↻ 3m  12 open')
})

test('a row drops its highest-ranked right parts first when narrow, whatever their order', async ($, on) => {
  const draw = kitPane($, on)
  const row = (k: Kit) => k.item('r', { lead: 'pr-open', text: 'kit: a terminal design system', right: [{ part: '2d ago', drop: 2 }, k.status('done', 'checks'), { part: '#31', drop: 1 }] }) as never
  const wide = shown(await draw(row, { columns: 100 }))
  expect(wide).toContain('2d ago')
  expect(wide).toContain('#31')
  // At 24 columns the row has 22 cells: the text keeps 6 after its lead, and the cluster
  // (6 + 8 + 3, a cell before each) doesn't fit until the age goes.
  const mid = shown(await draw(row, { columns: 24 }))
  expect(mid).not.toContain('2d ago')
  expect(mid).toContain('#31')
  expect(mid).toContain('checks')
  const narrow = shown(await draw(row, { columns: 18 }))
  expect(narrow).not.toContain('#31')
  expect(narrow).toContain('checks')
})

test('a path is cut in the middle, keeping its end', async ($, on) => {
  const draw = kitPane($, on)
  const path = 'mods/overview/hooks/terminal.tsx'
  const item = await draw(k => k.item('p', { lead: 'file', text: path, path: true, right: ['+12'] }) as never, { columns: 30 })
  expect(shown(item)).toContain('mods/…/terminal.tsx')
  const prop = await draw(k => k.prop('p', 'file', path, { path: true }) as never, { columns: 30 })
  expect(shown(prop)).toContain('…/terminal.tsx')
})

test('below 30 columns a section draws its header and figures only', async ($, on) => {
  const draw = kitPane($, on)
  const section = (k: Kit) => k.section({ id: 's', title: 'Limits', right: k.summary([['42%']]), children: [k.note('n', 'the body')] }) as never
  const narrow = shown(await draw(section, { columns: 28 }))
  expect(narrow).toContain('Limits')
  expect(narrow).toContain('42%')
  expect(narrow).not.toContain('the body')
  expect(shown(await draw(section, { columns: 30 }))).toContain('the body')
})

test('a sparkline is Braille on the terminal, newest on the right, and an SVG line on the desktop', async ($, on) => {
  const draw = kitPane($, on)
  const term = await draw(k => k.spark([0, 0, 4, 4, 8, 8], { width: 3 }) as never)
  // Two points a cell, four levels a row: empty, half, full.
  expect(shown(term)).toBe(` ${String.fromCharCode(SPARK.base | SPARK.left[2]! | SPARK.right[2]!)}${String.fromCharCode(SPARK.base | SPARK.left[4]! | SPARK.right[4]!)}`)
  const blocks = await draw(k => k.spark([0, 4, 8], { width: 3, glyphs: 'blocks' }) as never)
  expect(shown(blocks)).toBe(` ${METER.rise[4]}${METER.rise[8]}`)
  const desk = await draw(k => k.spark([1, 2, 3]) as never, { surface: 'desktop' })
  const svg = (function find(d: Drawn): Drawn | undefined {
    return d.type === 'Svg' ? d : kids(d).map(find).find(Boolean)
  })(desk)
  expect(String(svg?.props?.source)).toContain('<polyline')
})
