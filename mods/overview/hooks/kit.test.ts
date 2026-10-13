import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { TERM_GLYPH } from '@kit/icons'
import { C, FILL, GLYPH, INK, RAMP, STATUS, TRACK, TREE } from '@kit/tokens'
import { BAND_ROWS, BLANK, FOLD, MARK, METER, PERF_GLYPH, SPARK, TERM_ROLES, fold, holdButtons, kit } from '@kit/ui'
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
  for (const [name, g] of glyphs.filter(([n]) => !/^(TREE|MARK\.sep|METER\.rise\[0\])/.test(n))) {
    expect([...g].length, `${name} is one cell`).toBe(1)
  }
})

test('no role is italic, and only the title and the one strong figure are bold', async () => {
  for (const [name, role] of Object.entries(TERM_ROLES)) expect(Boolean(role.italic), `${name}`).toBe(false)
  expect(Object.entries(TERM_ROLES).filter(([, r]) => r.bold).map(([n]) => n)).toEqual(['title', 'strong'])
})

test('a bar is one row of the heavy line to the half cell; room and the rest are the light rail', async ($, on) => {
  const draw = kitPane($, on)
  const used = await draw(k => k.bar([{ value: 25, color: INK }], 100, { width: 10 }) as never)
  expect(shown(used)).toBe('━━╸───────')
  const room = await draw(k => k.bar([{ value: 30, color: INK }, { value: 20, color: TRACK, room: true }, { value: 10, color: C.warn, room: true }], 100, { width: 10 }) as never)
  expect(shown(room)).toBe('━━━───────')
  const runs = texts(room).filter(t => !kids(t).length)
  expect(runs.map(t => [shown(t), t.props?.color, Boolean(t.props?.dimColor)])).toEqual([
    ['━━━', undefined, false],
    ['──', undefined, true],
    ['─', 'warning', false],
    ['────', undefined, true],
  ])
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
  // Solid colours only, no shades or dithers: neighbours differ by tone.
  expect(runs.map(t => [shown(t), t.props?.color, Boolean(t.props?.dimColor)])).toEqual([
    ['━━', undefined, false],
    ['━━', undefined, true],
    ['━━', undefined, false],
    ['━━', undefined, true],
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

test("a legend label widens into the column's spare room and is cut with … only when the room runs out", async ($, on) => {
  const draw = kitPane($, on)
  const legend = (k: Kit) =>
    k.legend('l', [
      { label: 'SubagentStopped', color: C.cyan, figure: '12' },
      { label: 'Bash', color: C.orchid, figure: '3' },
      { label: 'Edit', color: C.cyan, figure: '7' },
    ]) as never
  const wide = shown(await draw(legend, { columns: 70 }))
  expect(wide).toContain('SubagentStopped')
  expect(wide).not.toContain('…')
  const narrow = shown(await draw(legend, { columns: 40 }))
  expect(narrow).not.toContain('SubagentStopped')
  expect(narrow).toContain('SubagentSto…')
})

test('a path is cut in the middle, keeping its end', async ($, on) => {
  const draw = kitPane($, on)
  const path = 'mods/overview/hooks/terminal.tsx'
  const item = await draw(k => k.item('p', { lead: 'file', text: path, path: true, right: ['+12'] }) as never, { columns: 30 })
  expect(shown(item)).toContain('mods/…/terminal.tsx')
  const prop = await draw(k => k.prop('p', 'file', path, { path: true }) as never, { columns: 30 })
  expect(shown(prop)).toContain('…/terminal.tsx')
})

/** Every string the tree carries, in drawing order: Button labels and text, depth first. */
const inOrder = (d: Drawn): string[] => [
  ...(d.type === 'Button' && typeof d.props?.label === 'string' ? [d.props.label as string] : []),
  ...((d.children ?? d.props?.children ?? []) as unknown[])
    .flat(Infinity)
    .flatMap(c => (typeof c === 'string' || typeof c === 'number' ? [String(c)] : c && typeof c === 'object' ? inOrder(c as Drawn) : [])),
]

test('a section heading reads icon, title, figures, then the fold arrow last, flush right, on each surface', async ($, on) => {
  const draw = kitPane($, on)
  const heading = (right: boolean, collapsed: boolean) => (k: Kit) =>
    k.section({
      id: 's',
      icon: GLYPH.context,
      title: 'Context',
      right: right ? k.summary([['11%', 'of 1M']]) : null,
      collapsed,
      onToggle: () => undefined,
      children: [k.note('n', 'the body')],
    }) as never
  const byKey = (key: string) =>
    function find(d: Drawn): Drawn | undefined {
      // A drawn tree keeps an element's key in its props.
      return (d.key ?? d.props?.key) === key ? d : kids(d).map(find).find(Boolean)
    }
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const collapsed of [false, true]) {
      const arrow = surface === 'terminal' ? (collapsed ? FOLD.closed : FOLD.open) : fold(collapsed)
      for (const right of [true, false]) {
        const where = `${surface}${collapsed ? ', folded' : ''}${right ? '' : ', no figures'}`
        const section = byKey('section-s')(await draw(heading(right, collapsed), { surface, columns: 60 }))!
        // The heading row's drawn strings: the title, the figures, and the arrow last, nothing after it.
        const row = inOrder(kids(section)[0]!).filter(t => t.trim() && t !== BLANK)
        const title = row.findIndex(t => t.includes('Context'))
        expect(title, `title at ${where}`).toBeGreaterThanOrEqual(0)
        if (right) expect(row.findIndex(t => t.includes('11%')), `figures after the title at ${where}`).toBeGreaterThan(title)
        expect(row.indexOf(arrow), `arrow after the title and figures at ${where}`).toBe(row.length - 1)
        // The arrow is the fold's Button, labelled with the arrow, so the desktop draws it and it presses.
        const button = byKey('toggle-s')(section)
        expect(button?.type, `toggle at ${where}`).toBe('Button')
        expect(button?.props?.label, `toggle at ${where}`).toBe(arrow)
      }
    }
  }
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

/** Every element in a drawn tree, depth first. */
const all = (d: Drawn): Drawn[] => [d, ...kids(d).flatMap(all)]
/** The vertical spacing props, which the desktop draws at half a row. */
const SPACING = ['margin', 'marginX', 'marginY', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'gap', 'rowGap', 'columnGap']

test('on the desktop the kit draws no outline: bands and tiles are fills with no border, and every band is one fixed height', async ($, on) => {
  const draw = kitPane($, on)
  const tree = await draw(
    k =>
      ({
        type: 'Box',
        props: { flexDirection: 'column' },
        children: [
          ...everything(k),
          // A band holding a Button and one holding only text come out the same height.
          k.section({ id: 'act', title: 'Actions', right: k.actions('a', [{ key: 'go', label: 'Start', onPress: () => undefined }]), children: [k.tile('t', [k.note('n', 'a tile')])] }),
          k.section({ id: 'plain', title: 'Plain', right: k.summary([['3', 'running']]), children: [k.tile('s', [k.note('n2', 'selected')], { selected: true })] }),
          // The desktop draws no key hints: k.hints is null there.
        ].filter(Boolean),
      }) as never,
    { surface: 'desktop', columns: 60 },
  )
  const boxes = all(tree).filter(d => d.type === 'Box')
  // A `transparent` border draws in the text's colour there, so the kit asks for no border at all.
  expect(boxes.filter(b => b.props?.borderStyle !== undefined || b.props?.borderColor !== undefined)).toEqual([])
  const bands = boxes.filter(b => b.props?.backgroundColor === FILL.head)
  // Five sections and the perf footer.
  expect(bands.length).toBe(6)
  for (const b of bands) {
    expect(b.props?.height).toBe(BAND_ROWS)
    expect(b.props?.paddingY).toBeUndefined()
  }
  const tiles = boxes.filter(b => b.props?.backgroundColor === FILL.tile || b.props?.backgroundColor === FILL.selected)
  // The two tiles (and the selected item row, which shares the selected tint).
  expect(tiles.length).toBe(3)
  // Spacing is plain finite numbers (or percentages), never negative: what the desktop accepts.
  for (const b of boxes)
    for (const p of SPACING) {
      const v = b.props?.[p]
      if (v === undefined) continue
      expect(typeof v === 'number' && Number.isFinite(v) && v >= 0).toBe(true)
    }
})

test('a danger action on the desktop is a red word under a blank-labelled Button, pressed by its key; on the terminal a red label', async ($, on) => {
  const draw = kitPane($, on)
  let pressed = 0
  const build = (k: Kit) => k.action({ key: 'proceed', label: 'Proceed', hotkey: '1', tone: 'danger', onPress: () => void pressed++ }) as never
  const desk = await draw(build, { surface: 'desktop' })
  const button = all(desk).find(d => d.type === 'Button')
  // The desktop draws a Button's label alone, uncoloured: the colour is on a Text beside it, the label blank.
  expect(button?.props?.label).toBe(BLANK.repeat('Proceed'.length))
  expect(kids(button!)).toEqual([])
  expect(button?.props?.hotkey).toBe('1')
  expect(texts(desk).find(t => shown(t) === 'Proceed')?.props).toMatchObject({ color: C.bad })
  const term = await draw(build)
  expect(all(term).find(d => d.type === 'Button')?.props?.label).toBe('Proceed')
  expect(texts(term).find(t => shown(t) === 'Proceed')?.props).toMatchObject({ color: 'error' })
})

test('a Button drawn alike keeps its press handle across a redraw, and a press on it runs the latest onPress', async ($, on) => {
  // Two sections; folding `a` between the renders changes a's arrow and leaves b's alone.
  let folded = false
  let pressedB = 0
  let raw = false
  on('ui.render', { component: 'Pane', requestId: 'kit' }, async ($$, e) => {
    const els = raw ? $$.ui.resolve(e) : holdButtons($$.ui.resolve(e), e)
    const k = kit(els as any, e.surface, e.props.bodyColumns, { focused: e.props.isFocused })
    // A fresh closure each render, as a mod's are: the press must reach this render's.
    const seen = folded
    return h(
      els.Box as never,
      { flexDirection: 'column' },
      k.section({ id: 'a', title: 'A', collapsed: folded, onToggle: () => undefined, children: null }),
      k.section({ id: 'b', title: 'B', onToggle: () => void (pressedB += seen ? 10 : 1), children: null }),
    ) as never
  })
  const pressOf = async (ui: { drawn: () => Promise<unknown> }, key: string) =>
    (all((await ui.drawn()) as Drawn).find(d => d.type === 'Button' && d.props?.key === key) as { press?: { plugin: string; handle: number } } | undefined)?.press
  const handleOf = async (ui: { drawn: () => Promise<unknown> }, key: string) => (await pressOf(ui, key))?.handle
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const held of [true, false]) {
      raw = !held
      folded = false
      const ui = await $.ui.mount({
        plugin: 'overview',
        surface,
        component: 'Pane',
        requestId: 'kit',
        props: { title: 'Kit', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
      })
      const a1 = await handleOf(ui, 'toggle-a')
      const b1 = await handleOf(ui, 'toggle-b')
      expect(b1, `${surface}: b's toggle is drawn with a handle`).toBeDefined()
      folded = true
      await ui.redraw()
      const a2 = await handleOf(ui, 'toggle-a')
      const b2 = await handleOf(ui, 'toggle-b')
      // A changed Button is a new one either way; an unchanged one keeps its handle only when held.
      expect(a2, `${surface}: a's toggle changed`).not.toBe(a1)
      if (held) {
        expect(b2, `${surface}: b's toggle keeps the handle the first drawing had`).toBe(b1)
        // The press the person made on the first drawing reaches the handler, and this render's closure.
        pressedB = 0
        // The pane is the test's own hook beneath the mod: its Buttons carry the test's plugin name.
        await ui.press({ key: 'toggle-b', plugin: (await pressOf(ui, 'toggle-b'))!.plugin })
        expect(pressedB, `${surface}: the press ran the latest onPress`).toBe(10)
      } else {
        expect(b2, `${surface}: without holdButtons the engine renumbers every Button`).not.toBe(b1)
      }
      await ui.unmount()
    }
  }
})
