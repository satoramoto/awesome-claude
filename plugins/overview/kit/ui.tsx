import type { RenderElement, RenderSurface } from 'claude-code'

import { pct, short } from './format'
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

/** The inspector's grid: the gutter the fold arrow sits in, and the label column. */
const GUTTER = 2
const LABEL = 10
/** A band's padding (section headers, the footer), so every band has one height and feel. */
const BAND_PAD_X = 0.8
const BAND_PAD_Y = 0.2
/** A section body's inset on the desktop, both sides: its left edge in line with the header's fold arrow. */
const BODY_INDENT = 1.2

/**
 * A section header's band: a tonal step that marks where each section starts. Solid,
 * not translucent, so its rounded border in the same colour doesn't show as a ring.
 * Tuned for the desktop's dark pane.
 */
const HEAD = '#272727'


/** The debug footer's glyph and hue for each job the mods time. */
const PERF_LOOK: Record<string, [string, string]> = {
  render: ['▣', C.purple],
  tick: ['↻', C.blue],
  resources: ['◎', C.slate],
  usage: ['◕', C.cyan],
  git: ['⎇', C.orchid],
  gh: ['⇡', C.ok],
}

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
   * One rounded end: a square `px` tall, a half circle on the outside and a filled
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

  /**
   * A card: a rounded border (`round`, which the desktop draws with rounded
   * corners and the terminal with ╭╮╰╯), an optional tinted fill, and padding.
   * Borders the desktop draws: round, single, double, bold, classic; not dashed.
   */
  const card = (key: string, children: RenderElement | (RenderElement | null)[], opts: { color?: string; fill?: string; border?: 'round' | 'single' | 'double' | 'bold' } = {}) => (
    <Box key={key} flexDirection="column" borderStyle={opts.border ?? 'round'} borderColor={opts.color ?? TRACK} backgroundColor={opts.fill} paddingX={1}>
      {children}
    </Box>
  )

  /** A rounded pill: a short colored figure, like a count or a state. */
  const pill = (key: string, color: string, text: string) =>
    terminal ? (
      <Text key={key} color={color}>{`(${text})`}</Text>
    ) : (
      <Box key={key} borderStyle="round" borderColor={color} paddingX={0.5}>
        <Text color={color}>{text}</Text>
      </Box>
    )

  /** A status flag: a glyph and a figure in one colour, the size of the text around it. */
  const flag = (key: string, color: string, glyph: string, figure: string | number) => (
    <Text key={key} color={color}>{`${glyph} ${figure}`}</Text>
  )

  /** A small round dot of colour, a legend's key. */
  const swatch = (color: string) => <Text color={color}>●</Text>

  /** A chip: a swatch, a figure, a dim tag. */
  const chip = (key: string, color: string, figure: string, tag?: string) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={terminal ? 1 : 0.5}>
      {swatch(color)}
      <Text>
        {figure}
        {tag ? <Text dimColor>{` ${tag}`}</Text> : null}
      </Text>
    </Box>
  )

  /** Things that sit side by side and wrap. */
  const flow = (items: RenderElement[], gap = 2) => (
    <Box flexDirection="row" flexWrap="wrap" columnGap={gap}>
      {items}
    </Box>
  )

  /**
   * A bar with parts and a legend under it: a chip per part, its figure from
   * `format`, its label as the tag. The context window is one. The legend sits
   * in cells of one width, so it reads as columns rather than a ragged wrap.
   */
  const legendBar = (parts: Part[], max: number, format: (n: number) => string = String, opts: { height?: number; cell?: number } = {}) => (
    <Box flexDirection="column">
      <Box flexDirection="row" marginTop={terminal ? 0 : 0.3}>
        {bar(parts, max, { height: opts.height ?? 0.6 })}
      </Box>
      <Box flexDirection="row" flexWrap="wrap" marginTop={terminal ? 0 : 0.3}>
        {parts
          .filter(p => p.value > 0)
          .map((p, i) => (
            <Box key={`legend-${i}`} width={opts.cell ?? 15} flexDirection="row" alignItems="center" gap={terminal ? 1 : 0.5}>
              {swatch(p.color)}
              <Text dimColor wrap="truncate">
                {p.label ?? ''}
              </Text>
              <Text>{format(p.value)}</Text>
            </Box>
          ))}
      </Box>
    </Box>
  )

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
   * A labelled bar on one line: a fixed-width label, the bar, a figure on the
   * right. Limits, tools, anything that is one value against a max.
   */
  const labelBar = (key: string, label: string, parts: Part[], max: number, figure: RenderElement, labelWidth = 10) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={1}>
      <Box width={labelWidth} flexShrink={0}>
        <Text wrap="truncate">{label}</Text>
      </Box>
      {bar(parts, max, { width: Math.max(4, columns - labelWidth - 10) })}
      <Box minWidth={7} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        {figure}
      </Box>
    </Box>
  )

  /** A stat: a colored glyph, a bold figure, an optional dim suffix. */
  const stat = (glyph: string, color: string, value: string, suffix?: string) => (
    <Text>
      <Text color={color}>{`${glyph} `}</Text>
      <Text bold>{value}</Text>
      {suffix ? <Text dimColor>{suffix}</Text> : null}
    </Text>
  )

  /** A list line: something on the left that truncates, something on the right that doesn't, an optional indent. */
  const line = (key: string, left: RenderElement, right?: RenderElement | null, indent = 0) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={1} paddingLeft={indent}>
      {left}
      {right ?? null}
    </Box>
  )

  /** A status line: a colored glyph, text that truncates, a dim figure on the right. */
  const item = (key: string, glyph: string, color: string, text: string, figure?: string, indent = 0) =>
    line(
      key,
      <Text wrap="truncate">
        <Text color={color}>{`${glyph} `}</Text>
        {text}
      </Text>,
      figure ? <Text dimColor>{figure}</Text> : null,
      indent,
    )

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
    /** A glyph before the title, in `color`. */
    icon?: string
    color?: string
    right?: RenderElement | null
    collapsed?: boolean
    onToggle?: () => void
    children: RenderElement | (RenderElement | null)[] | null
  }) => {
    const arrow = s.collapsed ? '▸' : '▾'
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
            gap: 1,
            paddingRight: terminal ? 0 : BAND_PAD_X,
            paddingY: terminal ? 0 : BAND_PAD_Y,
          },
          [
            <Box key="title" flexDirection="row" alignItems="center" flexShrink={1}>
              <Box width={GUTTER} flexShrink={0}>
                {toggle}
              </Box>
              {s.icon ? (
                <Box width={2} flexShrink={0}>
                  <Text color={s.color}>{s.icon}</Text>
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
          <Box flexDirection="column" paddingLeft={terminal ? GUTTER : BODY_INDENT} paddingRight={terminal ? 0 : BODY_INDENT} marginTop={terminal ? 0 : 0.25} rowGap={terminal ? 0 : 0.12}>
            {s.children}
          </Box>
        )}
      </Box>
    )
  }

  /** A property row: a dim label in the label column, a value beside it. */
  const prop = (key: string, label: string, value: RenderElement | string, labelWidth = LABEL) => (
    <Box key={key} flexDirection="row" gap={1}>
      <Box width={labelWidth} flexShrink={0}>
        <Text dimColor wrap="truncate">
          {label}
        </Text>
      </Box>
      {typeof value === 'string' ? <Text wrap="truncate">{value}</Text> : value}
    </Box>
  )

  /**
   * Sections side by side when there is room: each at least `minWidth` cells,
   * growing to share the row; one column when the pane is narrower than two.
   */
  const grid = (items: RenderElement[], minWidth = 34) => (
    <Box flexDirection="row" flexWrap="wrap" columnGap={terminal ? 2 : 1} rowGap={terminal ? 0 : 0.6} marginTop={terminal ? 1 : 0.6}>
      {items.map((it, i) => (
        <Box key={`cell-${i}`} flexGrow={1} width={0} minWidth={minWidth} flexDirection="column">
          {it}
        </Box>
      ))}
    </Box>
  )

  /**
   * A thin rounded gauge, `value` of `max`: a one-part bar.
   */
  const gauge = (value: number, max: number, color: string) => (terminal ? bar([{ value, color }], max) : bar([{ value, color }], max, { height: 0.3 }))

  /**
   * A reading, as an instrument shows one: a label, a thin gauge, a bold value
   * and a dim unit or note, in fixed columns so readings line up.
   */
  const reading = (key: string, r: { label: string; value: number; max: number; color: string; figure: string; unit?: string; unitColor?: string; labelWidth?: number }) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={1}>
      <Box width={r.labelWidth ?? LABEL} flexShrink={0}>
        <Text dimColor wrap="truncate">
          {r.label}
        </Text>
      </Box>
      {gauge(r.value, r.max, r.color)}
      <Box width={5} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text bold>{r.figure}</Text>
      </Box>
      <Box width={6} flexShrink={0}>
        <Text color={r.unitColor} dimColor={!r.unitColor}>
          {r.unit ?? ''}
        </Text>
      </Box>
    </Box>
  )

  /** A row with a slim coloured rail on the left: a name, a dim note, a figure on the right. */
  const rail = (key: string, r: { color: string; text: string; note?: string; figure?: string; indent?: number }) => (
    <Box key={key} flexDirection="row" gap={1} paddingLeft={r.indent ?? 0}>
      {terminal ? <Text color={r.color}>▎</Text> : <Box width={0.25} backgroundColor={r.color} flexShrink={0} />}
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1} gap={1}>
        <Text wrap="truncate">
          {r.text}
          {r.note ? <Text dimColor>{`  ${r.note}`}</Text> : null}
        </Text>
        {r.figure ? <Text dimColor>{r.figure}</Text> : null}
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
    const slots = Math.max(items.length, opts.slots ?? 0)
    return (
      <Box flexDirection="row" height={opts.height ?? 2.5} alignItems="flex-end" marginTop={0.3}>
        {Array.from({ length: slots - items.length }, () => (
          <Box flexGrow={1} width={0} />
        ))}
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
    // One glyph and hue per job, so a row reads at a glance; a slow job turns amber or red.
    const look = (name: string): [string, string] => PERF_LOOK[name] ?? ['•', C.slate]
    const items = [
      <Text key="perf-since">
        <Text color={C.slate}>⏱</Text>
        {` ${short(snap.sinceMs)}`}
      </Text>,
      ...rows.map(r => {
        const [glyph, hue] = look(r.name)
        const color = tone(r)
        return (
          <Text key={`perf-${r.name}`}>
            <Text color={color ?? hue}>{glyph}</Text>
            <Text color={color} bold={!!color}>{r.avgMs > 0 ? ` ${ms(r.avgMs)}` : ''}</Text>
            <Text dimColor>{` ${r.perMin}/m`}</Text>
          </Text>
        )
      }),
    ]
    const line = (key: string, row: RenderElement[]) => (
      <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={terminal ? 2 : 1.5}>
        {row}
      </Box>
    )
    // With a lead, one row only: the lead and the uptime, no wrap; what doesn't fit is cut.
    if (opts.lead?.length) {
      const row = [...opts.lead, share('perf-since', '⏱', C.slate, short(snap.sinceMs), '')]
      if (terminal) return <Box flexDirection="row" columnGap={2} marginTop={1} overflow="hidden">{row}</Box>
      return rounded(HEAD, { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 1, paddingX: BAND_PAD_X, paddingY: BAND_PAD_Y, flexShrink: 0, marginTop: 0.6, overflow: 'hidden' }, row)
    }
    if (terminal) return <Box marginTop={1}>{line('jobs', items)}</Box>
    return rounded(HEAD, { flexDirection: 'column', paddingX: BAND_PAD_X, paddingY: BAND_PAD_Y, flexShrink: 0, marginTop: 0.6 }, line('jobs', items))
  }

  /**
   * One resource reading for a footer: a coloured glyph, our figure in bold, and
   * the whole it's a share of, dim. `hot` tints our figure (amber, red) when it's a lot.
   */
  const share = (key: string, glyph: string, color: string, ours: string, whole: string, hot?: string) => (
    // The glyph in its own box: the desktop drops a space at the start of a Text.
    <Box key={key} flexDirection="row" gap={0.4} flexShrink={1}>
      <Text color={color}>{glyph}</Text>
      <Text wrap="truncate">
        <Text bold color={hot}>{ours}</Text>
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

  return { pinned, share, bar, capped, rounded, scale, gauge, reading, rail, prop, card, pill, flag, swatch, chip, flow, legendBar, labelBar, stat, line, item, section, grid, columns: columnsChart, perf: perfFooter }
}

export type Kit = ReturnType<typeof kit>
