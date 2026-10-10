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

/** A section header's band: a tonal step that marks where each section starts. */
const HEAD = 'rgba(128,128,128,0.13)'


export const kit = (els: Els, surface: RenderSurface, columns = 40) => {
  const { Box, Text, Button, Svg } = els
  const terminal = surface === 'terminal'

  /**
   * A bar's rounded end: a square as tall as the bar, a half circle on the outside
   * and a filled strip on the inside. Drawn at its exact pixel size, so it stays crisp
   * (an SVG the page has to scale blurs). Too-thin slivers didn't draw; squares do.
   */
  const cap = (px: number, color: string, side: 'left' | 'right'): RenderElement | null => {
    if (!Svg) return null
    const r = px / 2
    // One shape, not a circle over a rectangle: a translucent colour would paint the overlap twice.
    const d = side === 'left' ? `M${r} 0H${px}V${px}H${r}A${r} ${r} 0 0 1 ${r} 0Z` : `M0 0H${r}A${r} ${r} 0 0 1 ${r} ${px}H0Z`
    const source =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
      `<path d="${d}" fill="${color}"/></svg>`
    return (
      <Box flexShrink={0}>
        <Svg source={source} alt="bar end" width={px} height={px} />
      </Box>
    )
  }

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
    // With caps, the middle takes no height of its own: it stretches to the caps' exact pixel
    // height, so the two can't drift apart by a fraction of a pixel from row to row.
    const flat = (stretch: boolean) => (
      <Box flexDirection="row" flexGrow={1} height={stretch ? undefined : height} backgroundColor={TRACK} overflow="hidden">
        {/* An explicit full height: the desktop doesn't stretch a child to its parent's height. */}
        {shown.map(p => (
          <Box flexGrow={p.grow} flexShrink={0} width={0} height="100%" backgroundColor={p.color} />
        ))}
        {rest > 0 ? <Box flexGrow={rest} width={0} /> : null}
      </Box>
    )
    if (!Svg) return flat(false)
    // The caps sit inside the bar's width, so a scale under it still lines up with its ends.
    const px = Math.max(4, Math.round(height * ROW_PX))
    const first = shown[0]?.color ?? TRACK
    const last = rest > 0 ? TRACK : (shown[shown.length - 1]?.color ?? TRACK)
    return (
      <Box flexDirection="row" flexGrow={1} alignItems="stretch">
        {cap(px, first, 'left')}
        {flat(true)}
        {cap(px, last, 'right')}
      </Box>
    )
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
    return (
      <Box key={`section-${s.id}`} flexDirection="column" marginTop={terminal ? 1 : 0.7}>
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          gap={1}
          backgroundColor={terminal ? undefined : HEAD}
          // Rounded corners from the round border, in the band's own colour so it reads as no outline.
          borderStyle={terminal ? undefined : 'round'}
          borderColor={terminal ? undefined : HEAD}
          paddingRight={terminal ? 0 : 0.8}
          paddingY={terminal ? 0 : 0.2}
        >
          <Box flexDirection="row" alignItems="center" flexShrink={1}>
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
          </Box>
          {s.right ?? null}
        </Box>
        {s.collapsed ? null : (
          <Box flexDirection="column" paddingLeft={GUTTER} marginTop={terminal ? 0 : 0.25} rowGap={terminal ? 0 : 0.12}>
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
  const perfFooter = (snap: PerfSnapshot, opts: { max?: number } = {}) => {
    const rows = snap.rows.slice(0, opts.max ?? 6)
    const tone = (r: PerfRow) =>
      r.busyMs > 5_000 ? C.bad : r.busyMs > 1_000 || (r.name === 'render' && r.avgMs > 16) ? C.warn : undefined
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={terminal ? 1 : 0.6}>
        <Text dimColor>{`⏱ ${short(snap.sinceMs)}`}</Text>
        {rows.map(r => {
          const color = tone(r)
          const timing = r.avgMs > 0 ? `${ms(r.avgMs)} ` : ''
          return (
            <Text key={`perf-${r.name}`} dimColor={!color} color={color}>
              {`${r.name} ${timing}${r.perMin}/m`}
            </Text>
          )
        })}
      </Box>
    )
  }

  return { bar, scale, gauge, reading, rail, prop, card, pill, flag, swatch, chip, flow, legendBar, labelBar, stat, line, item, section, grid, columns: columnsChart, perf: perfFooter }
}

export type Kit = ReturnType<typeof kit>
