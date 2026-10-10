import type { RenderElement, RenderSurface } from 'claude-code'

import { pct, short } from './format'
import { ICON_PX, iconSvg } from './icons'
import { ms } from './perf'
import type { PerfRow, PerfSnapshot } from './perf'
import { C, MUTED, TRACK } from './tokens'

/**
 * The shared components. Each draws for the surface it is given: on the app
 * surfaces (desktop, VS Code, mobile) as boxes laid out by flexbox, crisp at
 * any width; in the terminal as cells, `columns` wide.
 *
 * What the desktop accepts (2.1.293): whole percentages only, `flexGrow` up to
 * 10000, fractional heights and margins; no `hover`. Borders `round` (rounded
 * corners), single, double, bold and classic draw; `dashed` doesn't. SVG is
 * drawn as an image: crisp only at its exact pixel size, so it's kept to small
 * fixed pieces like bar ends.
 */

/** The element constructors the kit draws with. `Button` is needed only for collapsible sections. */
export type Els = {
  Box: (props: any, ...children: any[]) => RenderElement
  Text: (props: any, ...children: any[]) => RenderElement
  Button?: (props: any, ...children: any[]) => RenderElement
  /** Rounds the ends of bars where the surface has it. */
  Svg?: (props: any, ...children: any[]) => RenderElement
}

/** A bar part: its value, its color, and the label its legend shows. */
export type Part = { value: number; color: string; label?: string }

const BAR = 0.45

/** One row's height in CSS pixels on the desktop, measured: a 0.45-row bar is 8.5px tall. */
const ROW_PX = 8.5 / 0.45

/*
 * The grid. Mods use these, never raw spacing numbers:
 *
 * - SPACE.pair between the two halves of a pair (glyph and figure, dot and label),
 *   SPACE.item between items in a row, SPACE.group between groups of items;
 *   SPACE.block between blocks inside a section body (rows in a list sit at 0).
 * - INSET: a band's (header, footer) padding on both sides, and a body's on the right,
 *   so header figures, body figures and the footer end on one line.
 * - BODY_INDENT: a body's left edge, just past the header's fold arrow.
 * - Reading columns: LABEL | gauge (grows) | FIG right-aligned | FIG2 right-aligned.
 */
export const SPACE = { pair: 0.5, item: 1, group: 2, block: 0.5 } as const
const INSET = 1
const BODY_INDENT = 1.6
/**
 * The content edges: everything that isn't a band (the header totals, section bodies)
 * starts at `left` and ends at `right`. Alignment rules, for every row:
 * - labels, names and titles start on the left edge;
 * - the row's last figure or action ends on the right edge (rows are space-between);
 * - figures are right-aligned; a row's right side is one cluster, never two.
 */
export const EDGE = { left: BODY_INDENT, right: INSET } as const
const LABEL = 10
const FIG = 5
const FIG2 = 6
/** The terminal's fold-arrow gutter. */
const GUTTER = 2
/** A band's height: one text row plus this above and below. */
const BAND_PAD_Y = 0.2

/**
 * The fold arrow: full-size triangles, since text can't be sized. U+FE0E keeps
 * ▶ a text glyph; without it macOS can draw it as an emoji.
 */
export const fold = (collapsed: boolean) => (collapsed ? '▶︎' : '▼')

/**
 * A section header's band: a tonal step that marks where each section starts. Solid,
 * not translucent, so its rounded border in the same colour doesn't show as a ring.
 * Tuned for the desktop's dark pane.
 */
const HEAD = '#272727'


/** The debug footer's glyph for each job the mods time; all muted, a slow job's figure turns amber or red. */
const PERF_GLYPH: Record<string, string> = { render: '▣', tick: '↻', resources: '◎', usage: '◕', git: '⎇', gh: '⇡' }

export const kit = (els: Els, surface: RenderSurface, columns = 40) => {
  const { Box, Text, Button, Svg } = els
  const terminal = surface === 'terminal'

  /*
   * Rounding on the desktop. Boxes have no corner radius; what rounds is:
   *
   * - `rounded`: a box a row or more tall. A `round` border in the fill's own colour,
   *   which must be solid (a translucent one paints twice where border and fill
   *   overlap and draws a ring). Not on thin boxes: the border takes room inside the
   *   box, so a thin one has nothing left for its content.
   * - `capped`: anything thin (bars, gauges). SVG end caps drawn at an exact pixel
   *   size, so they stay crisp; the middle takes no height and stretches to the caps.
   *
   * What doesn't work, so nobody tries again: borders on thin bars (empty, or blobs),
   * glyph ends (◖━◗, ╺━╸ don't draw), SVG slivers a few pixels wide (don't draw), an
   * SVG stretched to fit (blurs), a circle drawn over a rect in one SVG (a translucent
   * colour doubles where they overlap).
   */

  /**
   * An icon at the kit's one size (ICON_PX square): the SVG drawing where the
   * surface has SVG and the kit has one for `key`, else the glyph as text.
   */
  const icon = (key: string, color: string, px = ICON_PX): RenderElement => {
    const source = Svg ? iconSvg(key, color, px) : null
    if (!Svg || !source) return <Text color={color}>{key}</Text>
    return <Svg source={source} alt="icon" width={px} height={px} />
  }

  /**
   * One rounded end:a square `px` tall, a half circle on the outside and a filled
   * strip on the inside, as one shape.
   */
  const cap = (px: number, color: string, side: 'left' | 'right'): RenderElement | null => {
    if (!Svg) return null
    const r = px / 2
    const d = side === 'left' ? `M${r} 0H${px}V${px}H${r}A${r} ${r} 0 0 1 ${r} 0Z` : `M0 0H${r}A${r} ${r} 0 0 1 ${r} ${px}H0Z`
    const source =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
      `<path d="${d}" fill="${color}"/></svg>`
    return (
      <Box flexShrink={0}>
        <Svg source={source} alt="rounded end" width={px} height={px} />
      </Box>
    )
  }

  /**
   * Rounds the ends of something thin: `middle` between a `left` and a `right` cap,
   * `height` rows tall. Give `middle` no height of its own; it stretches to the caps,
   * whose pixel size it can't drift from. Where the surface has no SVG, `middle` alone
   * at `height`.
   */
  const capped = (height: number, left: string, right: string, middle: (height: number | undefined) => RenderElement): RenderElement => {
    if (terminal || !Svg) return middle(height)
    const px = Math.max(4, Math.round(height * ROW_PX))
    return (
      <Box flexDirection="row" flexGrow={1} alignItems="stretch">
        {cap(px, left, 'left')}
        {middle(undefined)}
        {cap(px, right, 'right')}
      </Box>
    )
  }

  /**
   * A filled box with rounded corners, a row or more tall. `color` must be solid
   * (hex, not rgba): the border that rounds it is the same colour. In the terminal,
   * the box without fill or border.
   */
  const rounded = (color: string, props: Record<string, unknown>, children: RenderElement | (RenderElement | null)[] | null) =>
    terminal ? (
      <Box {...props}>{children}</Box>
    ) : (
      <Box {...props} backgroundColor={color} borderStyle="round" borderColor={color}>
        {children}
      </Box>
    )

  /** A thin bar: parts left to right out of `max`, the rest as track. */
  const bar = (parts: Part[], max: number, opts: { height?: number; width?: number } = {}): RenderElement => {
    const total = Math.max(max, parts.reduce((n, p) => n + Math.max(0, p.value), 0), 1)
    if (terminal) {
      const w = opts.width ?? Math.max(4, columns - 20)
      let used = 0
      const cells = parts.map(p => {
        const n = p.value > 0 ? Math.min(Math.max(1, Math.round((p.value / total) * w)), w - used) : 0
        used += n
        return <Text color={p.color}>{'█'.repeat(Math.max(0, n))}</Text>
      })
      return (
        <Text>
          {cells}
          <Text dimColor>{'░'.repeat(Math.max(0, w - used))}</Text>
        </Text>
      )
    }
    // Grow factors out of 1000 (the desktop caps them at 10000): finer than a pixel at any width.
    // Rounded by SVG end caps around a flat middle. Borders can't round it: on the desktop a
    // border takes room inside the box, so a thin bordered track draws empty and bordered fills
    // draw as blobs; glyph bars (◖━◗, ╺━╸) don't draw at all.
    const height = opts.height ?? BAR
    const shown = parts.filter(p => p.value > 0).map(p => ({ ...p, grow: (p.value / total) * 1000 }))
    const rest = Math.max(0, 1000 - shown.reduce((n, p) => n + p.grow, 0))
    // Not `h`: that's the JSX factory.
    const flat = (rows: number | undefined) => (
      <Box flexDirection="row" flexGrow={1} height={rows} backgroundColor={TRACK} overflow="hidden">
        {/* An explicit full height: the desktop doesn't stretch a child to its parent's height. */}
        {shown.map(p => (
          <Box flexGrow={p.grow} flexShrink={0} width={0} height="100%" backgroundColor={p.color} />
        ))}
        {rest > 0 ? <Box flexGrow={rest} width={0} /> : null}
      </Box>
    )
    // The caps sit inside the bar's width, so a scale under it still lines up with its ends.
    const first = shown[0]?.color ?? TRACK
    const last = rest > 0 ? TRACK : (shown[shown.length - 1]?.color ?? TRACK)
    return capped(height, first, last, flat)
  }

  /** A small round dot of colour, a legend's key. */
  const swatch = (color: string) => <Text color={color}>●</Text>

  /**
   * A legend in columns (two by default): each cell a dot, a dim label that
   * truncates, and its figure right-aligned at the cell's end. `note` is an
   * optional coloured figure before it (a failure count).
   */
  const legend = (key: string, items: { label: string; color: string; figure: string; note?: string; noteColor?: string }[], cols = 2) => {
    // Columns of equal width, filled top to bottom; the last column's figures end on the right edge.
    const per = Math.ceil(items.length / cols)
    const columns = Array.from({ length: cols }, (_, c) => items.slice(c * per, c * per + per))
    return (
      // Whole-percent columns with the gutter as padding inside the first: the desktop
      // measures padding inside a box's width (zero-width growing columns stack there).
      <Box key={key} flexDirection="row">
        {columns.map((col, c) => (
          <Box key={`${key}-col-${c}`} width={`${Math.floor(100 / cols)}%`} paddingRight={c < cols - 1 ? SPACE.group : 0} flexDirection="column">
            {col.map(t => (
              <Box key={`${key}-${t.label}`} flexDirection="row" alignItems="center" gap={SPACE.pair}>
                {swatch(t.color)}
                <Box flexGrow={1} flexShrink={1}>
                  <Text dimColor wrap="truncate">
                    {t.label}
                  </Text>
                </Box>
                {t.note ? <Text color={t.noteColor}>{t.note}</Text> : null}
                <Text>{t.figure}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  }

  /** A caption: dim uppercase, for a chart's or a column's heading. The only uppercase besides a state word. */
  const caption = (text: string) => <Text dimColor>{text.toUpperCase()}</Text>

  /**
   * A header's right side, one form for every section: figures, each followed by
   * a dim lowercase unit, SPACE.group apart. A figure is coloured only when the
   * colour is a status.
   */
  const summary = (items: ([string, string?, string?] | null | false)[]) => (
    <Box flexDirection="row" gap={SPACE.group}>
      {items.filter((x): x is [string, string?, string?] => Boolean(x)).map(([figure, unit, color]) => (
        <Text key={`${figure}-${unit ?? ''}`}>
          <Text color={color}>{figure}</Text>
          {unit ? <Text dimColor>{` ${unit}`}</Text> : null}
        </Text>
      ))}
    </Box>
  )

  /**
   * Labels under a chart, each centred under its place: `at` from 0 to 1 across
   * the chart's width (the first and last flush with its ends).
   */
  const axis = (key: string, labels: { at: number; text: string }[]) => {
    const row: RenderElement[] = []
    const sorted = [...labels].sort((a, b) => a.at - b.at)
    sorted.forEach((l, i) => {
      // Each label owns the span halfway to its neighbours; the ends own up to the edge.
      const from = i === 0 ? 0 : (sorted[i - 1]!.at + l.at) / 2
      const to = i === sorted.length - 1 ? 1 : (l.at + sorted[i + 1]!.at) / 2
      const align = i === 0 && l.at === 0 ? 'flex-start' : i === sorted.length - 1 && l.at === 1 ? 'flex-end' : 'center'
      row.push(
        <Box key={`${key}-${i}`} flexGrow={Math.max(1, Math.round((to - from) * 1000))} width={0} flexDirection="row" justifyContent={align}>
          <Text dimColor>{l.text}</Text>
        </Box>,
      )
    })
    return (
      <Box key={key} flexDirection="row">
        {row}
      </Box>
    )
  }

  /**
   * An instrument's scale under a bar: ticks at 0, 25, 50, 75 and 100%, and a
   * marker where `mark` falls (a fraction of the scale), in `markColor`.
   */
  const scale = (mark?: number, markColor: string = C.warn) => {
    if (terminal) return null
    // Every tick at its place on the scale, the marker among them, gaps between sized by flex-grow.
    const marks: Array<{ at: number; color: string; height: number }> = [0, 0.25, 0.5, 0.75, 1].map(at => ({ at, color: TRACK, height: 0.3 }))
    if (mark !== undefined) marks.push({ at: Math.max(0, Math.min(1, mark)), color: markColor, height: 0.45 })
    marks.sort((a, b) => a.at - b.at)
    const row: RenderElement[] = []
    marks.forEach((m, i) => {
      if (i > 0) row.push(<Box key={`g${i}`} flexGrow={Math.max(0, (m.at - marks[i - 1]!.at) * 1000)} width={0} />)
      row.push(<Box key={`m${i}`} width={0.12} height={m.height} backgroundColor={m.color} flexShrink={0} />)
    })
    return (
      <Box flexDirection="row" alignItems="flex-start" height={0.45}>
        {row}
      </Box>
    )
  }

  /**
   * A section as a properties inspector draws one (Premiere's Effect Controls):
   * a collapsible header row (▾ title, figures on the right) and its properties
   * indented under the arrow. No panel, outline or tint: rows and indentation do
   * the grouping. Collapsible when given `onToggle` (the mod keeps which are
   * folded in its state); folded, only the header row shows.
   */
  const section = (s: {
    id: string
    title: string
    /** An icon before the title (a GLYPH, drawn as the kit's SVG icon), always muted. */
    icon?: string
    right?: RenderElement | null
    collapsed?: boolean
    onToggle?: () => void
    children: RenderElement | (RenderElement | null)[] | null
  }) => {
    const arrow = fold(Boolean(s.collapsed))
    const toggle =
      s.onToggle && Button ? (
        <Button key={`toggle-${s.id}`} plain dimColor label={arrow} onPress={() => s.onToggle?.()} />
      ) : (
        <Text dimColor>{arrow}</Text>
      )
    // The arrow and the icon each take a fixed column, so every title starts at the same x.
    // One standard row above each section, and no other margin: sections sit one row apart.
    return (
      <Box key={`section-${s.id}`} flexDirection="column" marginTop={1}>
        {rounded(
          HEAD,
          {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: SPACE.item,
            paddingX: terminal ? 0 : INSET,
            paddingY: terminal ? 0 : BAND_PAD_Y,
          },
          [
            <Box key="title" flexDirection="row" alignItems="center" flexShrink={1}>
              <Box width={terminal ? GUTTER : 1.6} flexShrink={0}>
                {toggle}
              </Box>
              {s.icon ? (
                <Box width={2} flexShrink={0} flexDirection="row" alignItems="center">
                  {icon(s.icon, MUTED)}
                </Box>
              ) : null}
              <Text wrap="truncate" bold>
                {s.title}
              </Text>
            </Box>,
            s.right ?? null,
          ],
        )}
        {/* A gentle indent: the body starts where the band's rounded corner turns straight. */}
        {s.collapsed ? null : (
          <Box flexDirection="column" paddingLeft={terminal ? GUTTER : BODY_INDENT} paddingRight={terminal ? 0 : INSET} marginTop={terminal ? 0 : 1} marginBottom={terminal ? 0 : 1}>
            {s.children}
          </Box>
        )}
      </Box>
    )
  }

  /** A property row: the dim label on the left edge, the value right-aligned on the right edge. */
  const prop = (key: string, label: string, value: RenderElement | string) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={SPACE.item}>
      <Text dimColor wrap="truncate">
        {label}
      </Text>
      {typeof value === 'string' ? <Text wrap="truncate">{value}</Text> : value}
    </Box>
  )

  /**
   * A thin rounded gauge, `value` of `max`: a one-part bar.
   */
  const gauge = (value: number, max: number, color: string) => (terminal ? bar([{ value, color }], max) : bar([{ value, color }], max, { height: 0.3 }))

  /**
   * A reading, as an instrument shows one: a dim label, a thin gauge, the value
   * and a dim unit or note, in fixed columns (LABEL | gauge | FIG | FIG2), both
   * figures right-aligned so the last ends on the inset like the header's.
   */
  const reading = (key: string, r: { label: string; value: number; max: number; color: string; figure: string; unit?: string; unitColor?: string; labelWidth?: number }) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={SPACE.item}>
      <Box width={r.labelWidth ?? LABEL} flexShrink={0}>
        <Text dimColor wrap="truncate">
          {r.label}
        </Text>
      </Box>
      {gauge(r.value, r.max, r.color)}
      <Box width={FIG} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text>{r.figure}</Text>
      </Box>
      <Box width={FIG2} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text color={r.unitColor} dimColor={!r.unitColor}>
          {r.unit ?? ''}
        </Text>
      </Box>
    </Box>
  )

  /** A row with a slim coloured rail on the left: a name, a dim note, a figure on the right. */
  const rail = (key: string, r: { color: string; text: string; note?: string; figures?: string[]; indent?: number }) => (
    <Box key={key} flexDirection="row" gap={terminal ? 1 : 0.75} paddingLeft={r.indent ?? 0}>
      {terminal ? <Text color={r.color}>▎</Text> : <Box width={0.25} backgroundColor={r.color} flexShrink={0} />}
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1} gap={SPACE.item}>
        <Text wrap="truncate">
          {r.text}
          {r.note ? <Text dimColor>{`  ${r.note}`}</Text> : null}
        </Text>
        {/* Figures in fixed right-aligned columns, so they line up row to row. */}
        <Box flexDirection="row" gap={SPACE.item} flexShrink={0}>
          {(r.figures ?? []).map((f, i) => (
            <Box key={`f${i}`} width={FIG} flexDirection="row" justifyContent="flex-end">
              <Text dimColor>{f}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )

  /** Stacked columns, one per item, scaled to the tallest; `slots` keeps a fixed column width. */
  const columnsChart = (items: Part[][], opts: { height?: number; slots?: number } = {}) => {
    const total = (s: Part[]) => s.reduce((n, p) => n + Math.max(0, p.value), 0)
    const max = Math.max(1, ...items.map(total))
    if (terminal) {
      const ramp = ' ▁▂▃▄▅▆▇█'
      return (
        <Text>
          {items.map(s => (
            <Text color={s.find(p => p.value > 0)?.color ?? MUTED}>{ramp[Math.round((total(s) / max) * 8)]}</Text>
          ))}
        </Text>
      )
    }
    // Columns fill from the left, so column i is centred at (i + 0.5) / slots: where `axis` puts its label.
    const slots = Math.max(items.length, opts.slots ?? 0)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" height={opts.height ?? 2.5} alignItems="flex-end">
          {items.map(s => (
            <Box flexGrow={1} width={0} height={pct(total(s), max)} flexDirection="row" justifyContent="center">
              <Box width="70%" height="100%" flexDirection="column">
                {s
                  .filter(p => p.value > 0)
                  .map(p => (
                    <Box height={pct(p.value, total(s))} backgroundColor={p.color} />
                  ))}
              </Box>
            </Box>
          ))}
          {Array.from({ length: slots - items.length }, () => (
            <Box flexGrow={1} width={0} />
          ))}
        </Box>
        {/* A baseline the columns stand on. */}
        <Box height={0.06} backgroundColor={TRACK} />
      </Box>
    )
  }

  /**
   * A debug footer: what the mod cost, from a `createPerf()` snapshot. One dim
   * line per row's worth: the costliest things in the last minute first, each
   * as its average time and how often it ran; amber past 1 s a minute or a
   * render over 16 ms, red past 5 s a minute.
   */
  const perfFooter = (snap: PerfSnapshot, opts: { max?: number; lead?: RenderElement[] } = {}) => {
    const rows = snap.rows.slice(0, opts.max ?? 6)
    const tone = (r: PerfRow) =>
      r.busyMs > 5_000 ? C.bad : r.busyMs > 1_000 || (r.name === 'render' && r.avgMs > 16) ? C.warn : undefined
    // Muted glyphs; only a slow job's figure takes colour (amber, red).
    const items = [
      share('perf-since', '⏱', short(snap.sinceMs), ''),
      ...rows.map(r => share(`perf-${r.name}`, PERF_GLYPH[r.name] ?? '•', r.avgMs > 0 ? ms(r.avgMs) : `${r.perMin}/m`, '', tone(r))),
    ]
    const band = (row: RenderElement[]) =>
      terminal ? (
        <Box flexDirection="row" columnGap={2} marginTop={1} overflow="hidden">
          {row}
        </Box>
      ) : (
        rounded(
          HEAD,
          { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', columnGap: SPACE.item, paddingX: INSET, paddingY: BAND_PAD_Y, flexShrink: 0, marginTop: SPACE.block, overflow: 'hidden' },
          row,
        )
      )
    // One row: the lead (when given) and the uptime, or the jobs; what doesn't fit is cut.
    return band(opts.lead?.length ? [...opts.lead, items[0]!] : items)
  }

  /**
   * One reading for a footer: a muted glyph, our figure, and the whole it's a
   * share of, dim. `hot` tints our figure (amber, red) when it's a lot.
   */
  const share = (key: string, glyph: string, ours: string, whole: string, hot?: string) => (
    // The glyph in its own box: the desktop drops a space at the start of a Text.
    <Box key={key} flexDirection="row" gap={SPACE.pair} flexShrink={1}>
      <Text color={MUTED}>{glyph}</Text>
      <Text wrap="truncate">
        <Text color={hot}>{ours}</Text>
        {whole ? <Text dimColor>{`/${whole}`}</Text> : null}
      </Text>
    </Box>
  )

  /**
   * A pane whose footer stays on the bottom edge: `body` fills the height above it.
   * For the debug footer, or anything that should sit under the content however short it is.
   */
  // `height="100%"` doesn't resolve in a pane, so the column takes the pane's height in
  // rows (`e.props.scroll.bodyRows`) and a growing spacer pushes the footer down. Taller
  // content than that just runs on, footer last.
  const pinned = (body: RenderElement | (RenderElement | null)[], footer: RenderElement, rows?: number) => (
    <Box flexDirection="column" minHeight={rows}>
      {body}
      <Box flexGrow={1} />
      {footer}
    </Box>
  )

  return { icon, pinned, share, bar, capped, rounded, scale, axis, legend, caption, summary, gauge, reading, rail, prop, swatch, section, columns: columnsChart, perf: perfFooter }
}

export type Kit = ReturnType<typeof kit>
