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
 * 10000, fractional heights and margins; no `hover`. No SVG: the page scales
 * it as an image and it blurs.
 */

/** The element constructors the kit draws with. `Button` is needed only for collapsible sections. */
export type Els = {
  Box: (props: any, ...children: any[]) => RenderElement
  Text: (props: any, ...children: any[]) => RenderElement
  Button?: (props: any, ...children: any[]) => RenderElement
}

/** A bar part: its value, its color, and the label its legend shows. */
export type Part = { value: number; color: string; label?: string }

const BAR = 0.45

export const kit = (els: Els, surface: RenderSurface, columns = 40) => {
  const { Box, Text, Button } = els
  const terminal = surface === 'terminal'

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
    const height = opts.height ?? BAR
    const shown = parts.filter(p => p.value > 0).map(p => ({ ...p, grow: (p.value / total) * 1000 }))
    const rest = Math.max(0, 1000 - shown.reduce((n, p) => n + p.grow, 0))
    return (
      <Box flexDirection="row" flexGrow={1} height={height} backgroundColor={TRACK} overflow="hidden">
        {shown.map(p => (
          <Box flexGrow={p.grow} flexShrink={0} width={0} height={height} backgroundColor={p.color} />
        ))}
        {rest > 0 ? <Box flexGrow={rest} width={0} /> : null}
      </Box>
    )
  }

  /** A small square of color. */
  const swatch = (color: string) => (terminal ? <Text color={color}>■</Text> : <Box width={1} height={0.7} backgroundColor={color} />)

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
   * `format`, its label as the tag. The context window is one.
   */
  const legendBar = (parts: Part[], max: number, format: (n: number) => string = String, opts: { height?: number } = {}) => (
    <Box flexDirection="column">
      <Box flexDirection="row" marginTop={terminal ? 0 : 0.3}>
        {bar(parts, max, { height: opts.height ?? 0.6 })}
      </Box>
      {flow(parts.filter(p => p.value > 0).map((p, i) => chip(`legend-${i}-${p.label ?? ''}`, p.color, format(p.value), p.label)))}
    </Box>
  )

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
   * A section: an icon, a heading, figures aligned right, and its content.
   * Collapsible when given `onToggle` (the mod keeps which are collapsed in its
   * state); collapsed, only the heading line shows.
   */
  const section = (s: {
    id: string
    icon: string
    color: string
    title: string
    right?: RenderElement | null
    collapsed?: boolean
    onToggle?: () => void
    children: RenderElement | (RenderElement | null)[] | null
  }) => {
    const toggle =
      s.onToggle && Button ? (
        <Button key={`toggle-${s.id}`} plain dimColor label={s.collapsed ? '▸' : '▾'} onPress={() => s.onToggle?.()} />
      ) : null
    return (
      <Box key={`section-${s.id}`} flexDirection="column" marginTop={terminal ? 1 : 0.6}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box flexDirection="row" alignItems="center" gap={terminal ? 1 : 0.5} flexShrink={1}>
            {toggle}
            <Text wrap="truncate">
              <Text color={s.color}>{`${s.icon} `}</Text>
              <Text bold>{s.title}</Text>
            </Text>
          </Box>
          {s.right ?? null}
        </Box>
        {s.collapsed ? null : s.children}
      </Box>
    )
  }

  /**
   * Sections side by side when there is room: each at least `minWidth` cells,
   * growing to share the row; one column when the pane is narrower than two.
   */
  const grid = (items: RenderElement[], minWidth = 34) => (
    <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
      {items.map((it, i) => (
        <Box key={`cell-${i}`} flexGrow={1} width={0} minWidth={minWidth} flexDirection="column">
          {it}
        </Box>
      ))}
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
          const timing = r.avgMs > 0 ? `${ms(r.avgMs)}·` : ''
          return (
            <Text key={`perf-${r.name}`} dimColor={!color} color={color}>
              {`${r.name} ${timing}${r.perMin}/m`}
            </Text>
          )
        })}
      </Box>
    )
  }

  return { bar, swatch, chip, flow, legendBar, labelBar, stat, line, item, section, grid, columns: columnsChart, perf: perfFooter }
}

export type Kit = ReturnType<typeof kit>
