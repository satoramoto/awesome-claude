import type { RenderElement, RenderSurface } from 'claude-code'

import { pct, short } from './format'
import { ICON_PX, glyphOf, iconSvg } from './icons'
import { ms } from './perf'
import type { PerfRow, PerfSnapshot } from './perf'
import { C, GLYPH, GRAY, MUTED, STATUS, TRACK, termInk, treePrefix } from './tokens'
import type { StatusKind } from './tokens'

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
export const SPACE = { pair: 0.75, item: 1.25, group: 2, block: 0.8 } as const
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

/*
 * The terminal's grid. A terminal lays out in whole cells, so it has its own
 * spacing (a fraction would round differently row to row) and draws to an exact
 * width in cells. `k.space` and `k.edge` give the grid for the kit's surface.
 *
 * - CELLS: pair 1 (glyph and figure), item 1 (columns of a reading), group 2
 *   (figures in a summary, actions in a row), block 1 (a blank row).
 * - Indent: a section body starts GUTTER (2) in, under the header's icon column;
 *   each tree level indents 2 more.
 * - Reading columns: LABEL (10) | gauge (the rest) | FIG (5) | FIG2 (6), one cell
 *   apart; under MIN_GAUGE cells of gauge the label narrows, then the gauge goes.
 */
export const CELLS = { pair: 1, item: 1, group: 2, block: 1 } as const
/** The fewest cells a terminal gauge is drawn in; narrower, the reading drops it and keeps its figures. */
const MIN_GAUGE = 6
/** The narrowest a terminal reading's label gets before its gauge is dropped. */
const MIN_LABEL = 6
/** The cells of its text a terminal list item keeps (with its ellipsis) before its right cluster is cut. */
const ITEM_KEEPS = 6

/**
 * The terminal's meter glyphs. A gauge is a heavy line on a light one, to half a
 * cell (╸); a bar is solid blocks on a shaded track, to an eighth of a cell.
 */
export const METER = {
  line: '━',
  half: '╸',
  rail: '─',
  block: '█',
  shade: '░',
  /** Left eighths, 0 to 8: an index of n is n/8 of a cell filled from the left. */
  eighths: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'],
  /** Lower eighths, 0 to 8: for columns that rise. */
  rise: [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
} as const

/** The terminal's fold arrows: the small triangles, a cell each. */
export const FOLD = { open: '▾', closed: '▸' } as const
/** A band's height: one text row plus this above and below. */
const BAND_PAD_Y = 0.3
/** A tile's padding above and below its lines, and the room between its lines: enough to breathe. */
const TILE_PAD_Y = 0.6
const TILE_ROW_GAP = 0.2

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

/** A tile's fill: between the pane and a header band. Solid, for the same reason as HEAD. */
const TILE = '#222222'

/** `a` blended with `b`: `share` of `a` (0 to 1) over `b`, as solid #rrggbb. Takes #rgb or #rrggbb; anything else comes back as `a`. */
const mix = (a: string, b: string, share: number) => {
  const rgb = (c: string) => {
    const hex = c.replace('#', '')
    const full = hex.length === 3 ? [...hex].map(x => x + x).join('') : hex
    return /^[0-9a-f]{6}$/i.test(full) ? [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) : null
  }
  const x = rgb(a)
  const y = rgb(b)
  if (!x || !y) return a
  return `#${x.map((v, i) => Math.round(v * share + y[i]! * (1 - share)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * `text` split for two terminal lines `width` cells wide: the first holds as many
 * whole words as fit (a word longer than the line is cut to it), the second the
 * rest, which the caller truncates. The second is empty when it all fits on one.
 */
const breakLine = (text: string, width: number): [string, string] => {
  const chars = [...text]
  if (chars.length <= width) return [text, '']
  // The last space at or before the line's end; none, a hard cut.
  let cut = -1
  for (let i = Math.min(width, chars.length - 1); i > 0; i--) {
    if (chars[i] === ' ') {
      cut = i
      break
    }
  }
  if (cut <= 0) return [chars.slice(0, width).join(''), chars.slice(width).join('').trimStart()]
  return [chars.slice(0, cut).join('').trimEnd(), chars.slice(cut + 1).join('').trimStart()]
}

/** A selected tile's fill: the tile's step, tinted towards the blue that marks what's live. Solid, as TILE. */
const TILE_SELECTED = '#232a3c'


/** The debug footer's glyph for each job the mods time; all muted, a slow job's figure turns amber or red. */
const PERF_GLYPH: Record<string, string> = { render: '▣', tick: '↻', resources: '◎', usage: '◕', git: '⎇', gh: '⇡' }

/*
 * The terminal's design language. The terminal can't draw the desktop's bands and
 * greys, so how a header stands out and how text steps down is a choice of its own.
 * `inspector` is today's look and the default; the other three are directions to
 * pick from, each drawn from the same mod code (`setTermLook`, or `kit(…, { look })`).
 * The desktop is the same in all four.
 *
 * Each names five text roles, so a row says what matters without more colours:
 * - title: a section's name;
 * - label: what a value is (a reading's, a prop's, a legend entry's label);
 * - value: the figure or word that answers (a reading's figure, a header's figures);
 * - secondary: text a reader still reads, after the main text (a list row's note);
 * - meta: what's scanned past (units, ages, counts in a list row).
 *
 * Status colours keep their one meaning in every look. A structure accent, where a
 * look has one, is a theme key no status uses: `planMode` (teal) or `claude` (the
 * brand orange that Claude Code's own chrome is drawn in).
 */
export type TermLook = 'inspector' | 'panel' | 'rules' | 'ledger'

/** Text props a terminal role is drawn with. */
type Role = { color?: string; backgroundColor?: string; dimColor?: boolean; bold?: boolean; italic?: boolean }

type LookSpec = {
  /** One line on what it is, for the stories. */
  about: string
  /** How a header stands out: as today (`plain`), a band behind the title, a rule out to the figures, dot leaders. */
  header: 'plain' | 'band' | 'rule' | 'leader'
  /** The fold arrow's props: dim, or a strong gutter mark. */
  arrow: Role
  /** The header icon's colour (a token or theme key), or null to leave icons out of headers. */
  icon: string | null
  /** Labels in capitals. */
  upper: boolean
  roles: Record<'title' | 'label' | 'value' | 'secondary' | 'meta', Role>
}

export const TERM_LOOKS: Record<TermLook, LookSpec> = {
  inspector: {
    about: 'Today: bold title, dim arrow and icon; labels, notes and units dim, values plain.',
    header: 'plain',
    arrow: { dimColor: true },
    icon: MUTED,
    upper: false,
    roles: { title: { bold: true }, label: { dimColor: true }, value: {}, secondary: { dimColor: true }, meta: { dimColor: true } },
  },
  panel: {
    about: 'Panel bands (k9s, btop, htop): the title on a teal band; labels teal, values bold, notes italic, units dim.',
    header: 'band',
    arrow: { dimColor: true },
    icon: 'inverseText',
    upper: false,
    roles: {
      title: { bold: true, color: 'inverseText', backgroundColor: 'planMode' },
      label: { color: 'planMode' },
      value: { bold: true },
      secondary: { italic: true },
      meta: { dimColor: true },
    },
  },
  rules: {
    about: 'Accent rules (lazygit, gh-dash): an orange title and icon, a dim rule out to the figures; labels plain, values bold, units dim italic.',
    header: 'rule',
    arrow: { dimColor: true },
    icon: 'claude',
    upper: false,
    roles: {
      title: { bold: true, color: 'claude' },
      label: {},
      value: { bold: true },
      secondary: { dimColor: true },
      meta: { dimColor: true, italic: true },
    },
  },
  ledger: {
    about: 'Ledger (gh, kubectl describe, systemctl status): no hue for structure; a bold arrow in the gutter, dot leaders, labels in dim capitals, values bold.',
    header: 'leader',
    arrow: { bold: true },
    icon: null,
    upper: true,
    roles: {
      title: { bold: true },
      label: { dimColor: true },
      value: { bold: true },
      secondary: { italic: true },
      meta: { dimColor: true },
    },
  },
}

let currentLook: TermLook = 'inspector'

/** Picks the terminal look every later `kit()` call draws in (unless it names one). The default is `inspector`. */
export const setTermLook = (look: TermLook) => {
  currentLook = look
}

/** The terminal look `kit()` draws in when it isn't given one. */
export const termLook = () => currentLook

export const kit = (els: Els, surface: RenderSurface, columns = 40, opts: { look?: TermLook } = {}) => {
  const { Box, Text, Button, Svg } = els
  const terminal = surface === 'terminal'
  const look = TERM_LOOKS[opts.look ?? currentLook] ?? TERM_LOOKS.inspector
  /** A text role's props on the terminal (see TERM_LOOKS). */
  const R = look.roles
  /** A label as the look writes it. */
  const labelText = (text: string) => (terminal && look.upper ? text.toUpperCase() : text)
  /** Text a step below the main text: one of the three greys on the app surfaces; plain dim in the terminal, whose greys are its own. */
  const tone = (level: keyof typeof GRAY) => (terminal ? { dimColor: true } : { color: GRAY[level] })
  /** A token colour as Text props for this surface: on the terminal a status's theme key, a grey as dim. */
  const ink = (color?: string): { color?: string; dimColor?: boolean } => (terminal ? termInk(color) : color ? { color } : {})
  /** The grid for this surface: CELLS on the terminal, SPACE elsewhere. */
  const space = terminal ? CELLS : SPACE
  const edge = terminal ? { left: GUTTER, right: 0 } : EDGE
  /** A section body's width in terminal cells: the pane's less the gutter. */
  const body = Math.max(1, Math.floor(columns) - GUTTER)
  const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

  /** A run of one glyph in one colour, as one Text. */
  const run = (key: string, glyph: string, n: number, props: Record<string, unknown>) =>
    n > 0 ? <Text key={key} {...props}>{glyph.repeat(n)}</Text> : null

  /**
   * A terminal gauge `width` cells wide: a heavy line to the half cell over a
   * dim light rail. Anything above zero shows at least half a cell.
   */
  const lineMeter = (fraction: number, color: string, width: number): RenderElement => {
    const w = Math.max(1, Math.floor(width))
    let halves = Math.round(clamp01(fraction) * w * 2)
    if (fraction > 0 && halves === 0) halves = 1
    const full = Math.floor(halves / 2)
    const half = halves % 2
    return (
      <Text>
        {run('fill', METER.line, full, ink(color))}
        {half ? <Text key="half" {...ink(color)}>{METER.half}</Text> : null}
        {run('rail', METER.rail, w - full - half, { dimColor: true })}
      </Text>
    )
  }

  /**
   * A terminal bar `width` cells wide: its parts in solid blocks to the eighth of
   * a cell, the rest shaded track. Where a part ends inside a cell, the cell
   * holds that part's eighths over the next part's colour.
   */
  const blockMeter = (parts: Part[], total: number, width: number): RenderElement => {
    const w = Math.max(1, Math.floor(width))
    const eighths = w * 8
    // Each part's end in eighths, cumulative; anything above zero gets at least an eighth.
    const ends: { end: number; color: string }[] = []
    let at = 0
    for (const p of parts) {
      if (!(p.value > 0)) continue
      at = Math.min(eighths, at + Math.max(1, Math.round((p.value / total) * eighths)))
      ends.push({ end: at, color: p.color })
    }
    const partAt = (e: number) => ends.find(x => e < x.end)
    const cells: { glyph: string; props: Record<string, unknown> }[] = []
    for (let c = 0; c < w; c++) {
      const from = c * 8
      const here = partAt(from)
      if (!here) {
        cells.push({ glyph: METER.shade, props: { dimColor: true } })
        continue
      }
      if (here.end >= from + 8) {
        cells.push({ glyph: METER.block, props: ink(here.color) })
        continue
      }
      const next = partAt(here.end)
      const nextInk = next ? ink(next.color) : {}
      cells.push({
        glyph: METER.eighths[here.end - from]!,
        props: { ...ink(here.color), ...(next && nextInk.color ? { backgroundColor: nextInk.color } : {}) },
      })
    }
    // Runs of the same glyph and colour, as one Text each.
    const runs: RenderElement[] = []
    let i = 0
    while (i < cells.length) {
      let j = i + 1
      while (j < cells.length && cells[j]!.glyph === cells[i]!.glyph && JSON.stringify(cells[j]!.props) === JSON.stringify(cells[i]!.props)) j++
      runs.push(<Text key={`r${i}`} {...cells[i]!.props}>{cells[i]!.glyph.repeat(j - i)}</Text>)
      i = j
    }
    return <Text>{runs}</Text>
  }

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
   * surface has SVG and the kit has one for `key`, else its glyph as text
   * (`glyphOf`: the terminal glyph for a named icon, never the name itself).
   */
  const icon = (key: string, color: string, px = ICON_PX): RenderElement => {
    const source = Svg && !terminal ? iconSvg(key, color, px) : null
    if (!Svg || !source) return <Text {...ink(color)}>{glyphOf(key)}</Text>
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
    // Over the track, as the bar's middle paints its parts: a see-through part's end
    // then comes out the same shade as the rest of it.
    const under = color === TRACK ? '' : `<path d="${d}" fill="${TRACK}"/>`
    const source =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
      `${under}<path d="${d}" fill="${color}"/></svg>`
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

  /**
   * A tile: one item of a list that has several lines (a branch and its PR), in its
   * own rounded fill a step lighter than the pane, so items read as units. A
   * `selected` tile takes a blue-tinted fill: picked, without an outline.
   */
  const tile = (key: string, children: (RenderElement | null)[], opts: { selected?: boolean } = {}) =>
    terminal ? (
      <Box key={key} flexDirection="column" marginTop={1}>
        {children}
      </Box>
    ) : (
      rounded(opts.selected ? TILE_SELECTED : TILE, { key, flexDirection: 'column', paddingX: SPACE.item, paddingY: TILE_PAD_Y, rowGap: TILE_ROW_GAP, width: '100%' }, children)
    )

  /**
   * A thin bar: parts left to right out of `max`, the rest as track. On the
   * terminal `width` cells wide (a section body's width by default): solid blocks
   * to the eighth of a cell; with `height` under 0.4, the gauge's heavy line instead.
   */
  const bar = (parts: Part[], max: number, opts: { height?: number; width?: number } = {}): RenderElement => {
    const total = Math.max(max, parts.reduce((n, p) => n + Math.max(0, p.value), 0), 1)
    if (terminal) {
      const w = opts.width ?? body
      if ((opts.height ?? BAR) < 0.4 && parts.length <= 1) return lineMeter((parts[0]?.value ?? 0) / total, parts[0]?.color ?? MUTED, w)
      return blockMeter(parts, total, w)
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
   * A label as GitHub draws one on a dark page: a rounded chip filled with the
   * label's colour, faint, and its name in a lighter tint of the same colour.
   * Blended to solid colours over the tile (rounding needs a solid fill). In the
   * terminal, the name in the label's colour.
   */
  const pill = (key: string, text: string, color: string) => {
    if (terminal) return <Text key={key} {...ink(color)}>{text}</Text>
    return rounded(mix(color, TILE, 0.22), { key, flexDirection: 'row', paddingX: 0.6, flexShrink: 0 }, [<Text key="t" color={mix(color, '#ffffff', 0.45)}>{text}</Text>])
  }

  /** A small dot of colour, a legend's key: round on the app surfaces, a square block on the terminal (as the bar it keys). */
  const swatch = (color: string) => <Text {...ink(color)}>{terminal ? '■' : '●'}</Text>

  /**
   * A legend in columns (two by default): each cell a dot, a dim label that
   * truncates, and its figure right-aligned at the cell's end. `note` is an
   * optional coloured figure before it (a failure count). On the terminal, as
   * many columns as fit at 18 cells each (one at 30 columns).
   */
  const legend = (key: string, items: { label: string; color: string; figure: string; note?: string; noteColor?: string }[], maxCols?: number) => {
    // Few rows: two columns for up to four entries, three beyond. (The pane's reported
    // width in columns runs smaller than what the desktop draws, so it can't decide this.)
    // The terminal's width is exact, so there it does.
    const fit = terminal ? Math.max(1, Math.floor((body + CELLS.group) / (18 + CELLS.group))) : 3
    const cols = Math.min(maxCols ?? 3, fit, items.length <= 4 ? 2 : 3, Math.max(1, items.length))
    const per = Math.ceil(items.length / cols)
    const groups = Array.from({ length: cols }, (_, c) => items.slice(c * per, c * per + per))
    return (
      // The legend spans the body (the desktop doesn't stretch a nested box), and its
      // columns share that width equally, as a bar's parts do: grow from zero width.
      <Box key={key} flexDirection="row" width="100%" gap={space.group}>
        {groups.map((col, c) => (
          <Box key={`${key}-col-${c}`} flexGrow={1} width={0} flexDirection="column">
            {col.map(t => (
              // The full column's width (the desktop doesn't stretch it); the label gives way first.
              <Box key={`${key}-${t.label}`} flexDirection="row" alignItems="center" gap={space.pair} width="100%">
                {swatch(t.color)}
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text {...(terminal ? R.label : tone('light'))} wrap="truncate">
                    {labelText(t.label)}
                  </Text>
                </Box>
                {t.note ? <Text {...ink(t.noteColor)}>{t.note}</Text> : null}
                <Text {...(terminal ? R.value : {})}>{t.figure}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  }

  /** A caption: dim uppercase, for a chart's or a column's heading. The only uppercase besides a state word. */
  const caption = (text: string) => <Text {...(terminal ? R.meta : tone('mid'))}>{text.toUpperCase()}</Text>

  /**
   * A header's right side, one form for every section: figures, each followed by
   * a dim lowercase unit, SPACE.group apart. A figure is coloured only when the
   * colour is a status.
   */
  const summary = (items: ([string, string?, string?] | null | false)[]) => {
    const shown = items.filter((x): x is [string, string?, string?] => Boolean(x))
    if (terminal) {
      // One line of text, the figures CELLS.group apart: too wide for its room, it's
      // cut wherever that falls and ends in an ellipsis, never mid-figure without one.
      return (
        <Box flexDirection="row" minWidth={0} flexShrink={1}>
          <Text wrap="truncate">
            {shown.map(([figure, unit, color], i) => (
              <Text key={`${figure}-${unit ?? ''}`}>
                {i ? ' '.repeat(CELLS.group) : null}
                <Text {...R.value} {...ink(color)}>{figure}</Text>
                {unit ? <Text {...R.meta}>{` ${unit}`}</Text> : null}
              </Text>
            ))}
          </Text>
        </Box>
      )
    }
    // Too wide for the band, the last item ends in an ellipsis and what's past it is cut.
    return (
      <Box flexDirection="row" gap={space.group} minWidth={0} flexShrink={1} overflow="hidden">
        {shown.map(([figure, unit, color], i) => (
          <Text key={`${figure}-${unit ?? ''}`} wrap={i === shown.length - 1 ? 'truncate' : undefined}>
            <Text {...ink(color)}>{figure}</Text>
            {unit ? <Text {...tone('mid')}>{` ${unit}`}</Text> : null}
          </Text>
        ))}
      </Box>
    )
  }

  /**
   * Labels under a chart, each centred under its place: `at` from 0 to 1 across
   * the chart's width (the first and last flush with its ends). On the terminal
   * one dim line `width` cells wide (a section body's by default; pass the
   * chart's): a label that would touch the one before it is left out.
   */
  const axis = (key: string, labels: { at: number; text: string }[], width?: number) => {
    const row: RenderElement[] = []
    const sorted = [...labels].sort((a, b) => a.at - b.at)
    if (terminal) {
      const w = Math.max(1, Math.floor(width ?? body))
      const line = Array.from({ length: w }, () => ' ')
      let free = 0
      for (const l of sorted) {
        const text = [...l.text]
        const start = Math.max(0, Math.min(w - text.length, Math.round(clamp01(l.at) * w - text.length / 2)))
        if (start < free || start + text.length > w) continue
        text.forEach((ch, i) => (line[start + i] = ch))
        free = start + text.length + 1
      }
      return (
        <Text key={key} dimColor>
          {line.join('').trimEnd()}
        </Text>
      )
    }
    sorted.forEach((l, i) => {
      // Each label owns the span halfway to its neighbours; the ends own up to the edge.
      const from = i === 0 ? 0 : (sorted[i - 1]!.at + l.at) / 2
      const to = i === sorted.length - 1 ? 1 : (l.at + sorted[i + 1]!.at) / 2
      const align = i === 0 && l.at === 0 ? 'flex-start' : i === sorted.length - 1 && l.at === 1 ? 'flex-end' : 'center'
      row.push(
        <Box key={`${key}-${i}`} flexGrow={Math.max(1, Math.round((to - from) * 1000))} width={0} flexDirection="row" justifyContent={align}>
          <Text {...tone('dark')}>{l.text}</Text>
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
   * marker where `mark` falls (a fraction of the scale), in `markColor`. On the
   * terminal a row `width` cells wide (a section body's by default, as `bar`):
   * dim ticks (╵) and the marker as ▴.
   */
  const scale = (mark?: number, markColor: string = C.warn, width?: number) => {
    if (terminal) {
      const w = Math.max(2, Math.floor(width ?? body))
      const row = Array.from({ length: w }, () => ' ')
      for (const at of [0, 0.25, 0.5, 0.75, 1]) row[Math.round(at * (w - 1))] = '╵'
      const m = mark === undefined ? -1 : Math.round(clamp01(mark) * (w - 1))
      if (m < 0) return <Text dimColor>{row.join('')}</Text>
      return (
        <Text>
          <Text dimColor>{row.slice(0, m).join('')}</Text>
          <Text {...ink(markColor)}>▴</Text>
          <Text dimColor>{row.slice(m + 1).join('')}</Text>
        </Text>
      )
    }
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
    /**
     * On the terminal, the right side (figures, buttons) keeps its natural width
     * and only the title is cut, with an ellipsis: for a header whose right side
     * is controls that must all show. Size the right side to fit the row yourself.
     * Without it, the title keeps up to 12 cells and then it and the figures give
     * way together. The desktop draws the same either way.
     */
    keepRight?: boolean
    children: RenderElement | (RenderElement | null)[] | null
  }) => {
    if (terminal) {
      // ▾ ◔ Title ………………… figures
      //   body, two cells in, under the icon column
      // No band and no rule: bold, the dim arrow and the indent make the hierarchy.
      // Sections stack without blank rows; an open one leaves one under its body.
      // The other looks (TERM_LOOKS) put the title on a band (`▾  ◔ Title  …… figures`),
      // run a dim rule (`▾ ◔ Title ──── figures`) or dot leaders (`▾ Title ···· figures`)
      // out to the figures, and draw the arrow, icon and title in their own roles.
      const arrow = s.collapsed ? FOLD.closed : FOLD.open
      const toggle =
        s.onToggle && Button ? (
          <Button key={`toggle-${s.id}`} plain {...look.arrow} label={arrow} onPress={() => s.onToggle?.()} />
        ) : (
          <Text {...look.arrow}>{arrow}</Text>
        )
      const band = look.header === 'band'
      const iconKey = s.icon && look.icon ? s.icon : null
      // On a band the icon is part of the band's text, padded a cell each side; with
      // `keepRight` unpadded, so the title has the room the mod sized the row for.
      const pad = band && !s.keepRight ? ' ' : ''
      const title = band ? `${pad}${iconKey ? `${glyphOf(iconKey)} ` : ''}${s.title}${pad}` : s.title
      const lead = GUTTER + (iconKey && !band ? 2 : 0)
      const keeps = Math.min([...title].length, band ? 14 : 12)
      const fill = look.header === 'rule' ? METER.rail : look.header === 'leader' ? '·' : null
      return (
        <Box key={`section-${s.id}`} flexDirection="column" marginBottom={s.collapsed ? 0 : 1}>
          <Box flexDirection="row" justifyContent="space-between" gap={fill ? CELLS.item : CELLS.group}>
            {/* The title keeps up to 12 cells of itself; past that, it and the figures give way
                together. With `keepRight` only the title gives way: the arrow and icon stay. */}
            <Box key="title" flexDirection="row" flexShrink={1} minWidth={s.keepRight ? lead : lead + keeps}>
              <Box width={GUTTER} flexShrink={0}>
                {toggle}
              </Box>
              {iconKey && !band ? (
                <Box width={2} flexShrink={0}>
                  {icon(iconKey, look.icon!)}
                </Box>
              ) : null}
              <Box flexShrink={1} minWidth={0}>
                <Text wrap="truncate" {...R.title}>
                  {title}
                </Text>
              </Box>
            </Box>
            {/* The rule or leaders take only the room left: from no width, cut at their box's edge. */}
            {fill ? (
              <Box key="fill" flexGrow={1} flexShrink={1} width={0} minWidth={0} height={1} overflow="hidden">
                <Text dimColor>{fill.repeat(Math.max(1, Math.floor(columns)))}</Text>
              </Box>
            ) : null}
            {s.right ? (
              <Box key="right" flexDirection="row" minWidth={0} flexShrink={s.keepRight ? 0 : 1} overflow="hidden">
                {s.right}
              </Box>
            ) : null}
          </Box>
          {s.collapsed ? null : (
            <Box flexDirection="column" paddingLeft={GUTTER}>
              {s.children}
            </Box>
          )}
        </Box>
      )
    }
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
            // The title keeps its room; the right side gives way.
            <Box key="title" flexDirection="row" alignItems="center" flexShrink={0}>
              {/* A minimum, not a width: the desktop draws a Button natively, with padding, and clips it to a box too narrow for that. */}
              <Box minWidth={terminal ? GUTTER : 1.6} flexShrink={0}>
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
            s.right ? (
              <Box key="right" flexDirection="row" minWidth={0} flexShrink={1} overflow="hidden">
                {s.right}
              </Box>
            ) : null,
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

  /**
   * A property row: the dim label on the left edge, the value right-aligned on the
   * right edge. On the terminal, as an inspector lists them: the label in the
   * reading's label column (LABEL cells, wider labels keep their length), the
   * value after it, left-aligned and cut at the edge.
   */
  const prop = (key: string, label: string, value: RenderElement | string) =>
    terminal ? (
      <Box key={key} flexDirection="row" gap={CELLS.item}>
        <Box width={Math.min(Math.max(LABEL, [...label].length), 16)} flexShrink={0}>
          <Text {...R.label} wrap="truncate">
            {labelText(label)}
          </Text>
        </Box>
        <Box minWidth={0} flexShrink={1} flexGrow={1}>
          {typeof value === 'string' ? <Text {...R.value} wrap="truncate">{value}</Text> : value}
        </Box>
      </Box>
    ) : (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={SPACE.item}>
      <Box minWidth={0} flexShrink={1}>
        <Text {...tone('mid')} wrap="truncate">
          {label}
        </Text>
      </Box>
      <Box minWidth={0} flexShrink={1}>
        {typeof value === 'string' ? <Text wrap="truncate">{value}</Text> : value}
      </Box>
    </Box>
  )

  /**
   * A thin rounded gauge, `value` of `max`: a one-part bar. On the terminal a
   * heavy line on a light rail, `width` cells (a section body's by default).
   */
  const gauge = (value: number, max: number, color: string, opts: { width?: number } = {}) =>
    terminal ? lineMeter(value / Math.max(max, 1e-9), color, opts.width ?? body) : bar([{ value, color }], max, { height: 0.3 })

  /**
   * A reading, as an instrument shows one: a dim label, a thin gauge, the value
   * and a dim unit or note, in fixed columns (LABEL | gauge | FIG | FIG2), both
   * figures right-aligned so the last ends on the inset like the header's.
   *
   * On the terminal the row is `width` cells (a section body's by default; pass it
   * when the reading sits deeper or outside a section): the gauge takes what the
   * columns leave; under 6 cells the label narrows, then the gauge is left out.
   */
  const reading = (key: string, r: { label: string; value: number; max: number; color: string; figure: string; unit?: string; unitColor?: string; labelWidth?: number; width?: number }) => {
    if (terminal) {
      const w = Math.floor(r.width ?? body)
      const fixed = FIG + FIG2 + 3 * CELLS.item
      let label = r.labelWidth ?? LABEL
      let room = w - label - fixed
      if (room < MIN_GAUGE) {
        label = Math.max(MIN_LABEL, label - (MIN_GAUGE - room))
        room = w - label - fixed
      }
      const shown = room >= MIN_GAUGE
      if (!shown) label = Math.max(1, w - FIG - FIG2 - 2 * CELLS.item)
      return (
        <Box key={key} flexDirection="row" gap={CELLS.item}>
          <Box width={label} flexShrink={0}>
            <Text {...R.label} wrap="truncate">
              {labelText(r.label)}
            </Text>
          </Box>
          {shown ? lineMeter(r.value / Math.max(r.max, 1e-9), r.color, room) : null}
          <Box width={FIG} flexShrink={0} flexDirection="row" justifyContent="flex-end">
            <Text {...R.value} wrap="truncate">{r.figure}</Text>
          </Box>
          <Box width={FIG2} flexShrink={0} flexDirection="row" justifyContent="flex-end">
            <Text {...(r.unitColor ? ink(r.unitColor) : R.meta)} wrap="truncate">
              {r.unit ?? ''}
            </Text>
          </Box>
        </Box>
      )
    }
    return (
    <Box key={key} flexDirection="row" alignItems="center" gap={SPACE.item}>
      <Box width={r.labelWidth ?? LABEL} flexShrink={0}>
        <Text {...tone('light')} wrap="truncate">
          {r.label}
        </Text>
      </Box>
      {gauge(r.value, r.max, r.color)}
      <Box width={FIG} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text>{r.figure}</Text>
      </Box>
      <Box width={FIG2} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text {...(r.unitColor ? { color: r.unitColor } : tone('mid'))}>
          {r.unit ?? ''}
        </Text>
      </Box>
    </Box>
    )
  }

  /** A row with a slim coloured rail on the left: a name, a dim note, a figure on the right. */
  const rail = (key: string, r: { color: string; text: string; note?: string; figures?: string[]; indent?: number }) => (
    <Box key={key} flexDirection="row" gap={terminal ? CELLS.pair : 0.75} paddingLeft={r.indent ?? 0}>
      {terminal ? <Text {...ink(r.color)}>▎</Text> : <Box width={0.25} backgroundColor={r.color} flexShrink={0} />}
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1} flexShrink={1} minWidth={0} gap={space.item}>
        <Box flexShrink={1} minWidth={0}>
          <Text wrap="truncate">
            {r.text}
            {r.note ? <Text {...tone('mid')}>{`  ${r.note}`}</Text> : null}
          </Text>
        </Box>
        {/* Figures in fixed right-aligned columns, so they line up row to row. */}
        <Box flexDirection="row" gap={space.item} flexShrink={0}>
          {(r.figures ?? []).map((f, i) => (
            <Box key={`f${i}`} width={FIG} flexDirection="row" justifyContent="flex-end">
              <Text {...tone('mid')}>{f}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )

  /**
   * Stacked columns, one per item, scaled to the tallest; `slots` keeps a fixed
   * column width. On the terminal `height` rows tall (2.5 rounds to 3), to the
   * eighth of a row, each slot as wide as `width` (a section body's) allows with a
   * cell between; each cell takes the colour of the part at its middle.
   */
  const columnsChart = (items: Part[][], opts: { height?: number; slots?: number; width?: number } = {}) => {
    const total = (s: Part[]) => s.reduce((n, p) => n + Math.max(0, p.value), 0)
    const max = Math.max(1, ...items.map(total))
    if (terminal) {
      const rows = Math.max(1, Math.round(opts.height ?? 2.5))
      const slots = Math.max(items.length, opts.slots ?? 0, 1)
      const per = Math.max(1, Math.floor((opts.width ?? body) / slots))
      const wide = per >= 3 ? per - 1 : per
      const gap = per - wide
      // Each column's height in eighths of a row, and the part at a given eighth.
      const tall = items.map(s => (total(s) > 0 ? Math.max(1, Math.round((total(s) / max) * rows * 8)) : 0))
      const partAt = (s: Part[], i: number, e: number) => {
        let acc = 0
        const t = tall[i]!
        for (const p of s.filter(x => x.value > 0)) {
          acc += (p.value / total(s)) * t
          if (e < acc) return p
        }
        return s.filter(x => x.value > 0).pop()
      }
      const lines: RenderElement[] = []
      for (let r = rows - 1; r >= 0; r--) {
        const cells = items.map((s, i) => {
          const level = Math.max(0, Math.min(8, tall[i]! - r * 8))
          const part = level > 0 ? partAt(s, i, r * 8 + level / 2) : undefined
          return (
            <Text key={`c${i}`} {...ink(part?.color ?? MUTED)}>
              {(METER.rise[level] ?? ' ').repeat(wide)}
              {' '.repeat(gap)}
            </Text>
          )
        })
        lines.push(<Text key={`row${r}`}>{cells}</Text>)
      }
      return (
        <Box flexDirection="column" width={per * slots} flexShrink={0}>
          {lines}
        </Box>
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
      // ⏱ has an emoji presentation, so the terminal draws the clock face it has in GLYPH.
      share('perf-since', terminal ? GLYPH.time : '⏱', short(snap.sinceMs), ''),
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
    <Box key={key} flexDirection="row" gap={space.pair} flexShrink={1}>
      <Text {...tone('mid')}>{glyph}</Text>
      <Text wrap="truncate">
        <Text {...ink(hot)}>{ours}</Text>
        {whole ? <Text {...tone('dark')}>{`/${whole}`}</Text> : null}
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

  /**
   * A status's mark (STATUS in `@kit/tokens`): its glyph in its colour, and the
   * word after it in the same colour when given (`✓ checks pass`, `◐ running`).
   */
  const status = (kind: StatusKind, label?: string, key?: string) => {
    const s = STATUS[kind]
    return (
      <Text key={key} {...ink(s.color)} wrap="truncate">
        {label ? `${s.glyph} ${label}` : s.glyph}
      </Text>
    )
  }

  /**
   * One row of a list, the shape every list in the mods takes:
   *
   *   [tree][lead] text  note ……………… right figures and actions
   *
   * - `tree`: a connector from `treePrefix` (dim), for nested rows;
   * - `lead`: a status kind, an icon key (drawn in `leadColor`, muted by default)
   *   or an element, in a two-cell column so the text starts on the grid;
   * - `text` truncates first, `note` (dim) runs on after it, plain dim whatever
   *   `textColor` or `bold` the text has;
   * - `right`: figures (strings, dim) and elements, one cluster on the right edge.
   *   On the terminal, once the text is down to its first 6 cells, the cluster's
   *   last element is cut (a string with an ellipsis), then the ones before it,
   *   rather than running past the edge.
   */
  const item = (
    key: string,
    r: {
      text: string
      note?: string
      lead?: StatusKind | string | RenderElement | null
      leadColor?: string
      tree?: string
      textColor?: string
      bold?: boolean
      dim?: boolean
      indent?: number
      right?: (RenderElement | string | null | false)[]
    },
  ) => {
    const lead =
      r.lead == null
        ? null
        : typeof r.lead === 'string'
          ? r.lead in STATUS
            ? status(r.lead as StatusKind)
            : icon(r.lead, r.leadColor ?? MUTED)
          : r.lead
    const right = (r.right ?? []).filter((x): x is RenderElement | string => Boolean(x))
    if (terminal) {
      // The text gives way first (it shrinks a thousand times as fast) down to its first
      // ITEM_KEEPS cells; then the right cluster is cut from its end, so nothing runs
      // past the edge. The note is its own run, plain dim whatever the text's colour or weight.
      const last = right.length - 1
      const look = r.dim ? { dimColor: true } : ink(r.textColor)
      const keeps = (r.tree ? [...r.tree].length : 0) + (lead ? 2 : 0) + Math.min([...r.text].length, ITEM_KEEPS)
      return (
        <Box key={key} flexDirection="row" justifyContent="space-between" gap={CELLS.item} paddingLeft={r.indent ?? 0}>
          <Box flexDirection="row" flexShrink={1000} minWidth={right.length ? keeps : 0}>
            {r.tree ? (
              <Box flexShrink={0}>
                <Text dimColor>{r.tree}</Text>
              </Box>
            ) : null}
            {lead ? (
              <Box width={2} flexShrink={0} flexDirection="row">
                {lead}
              </Box>
            ) : null}
            <Box flexShrink={1} minWidth={0}>
              {r.note ? (
                <Text wrap="truncate">
                  <Text bold={r.bold} {...look}>
                    {r.text}
                  </Text>
                  <Text {...R.secondary}>{`  ${r.note}`}</Text>
                </Text>
              ) : (
                <Text wrap="truncate" bold={r.bold} {...look}>
                  {r.text}
                </Text>
              )}
            </Box>
          </Box>
          {right.length ? (
            <Box flexDirection="row" gap={CELLS.item} flexShrink={1} minWidth={0} overflow="hidden">
              {/* The last element gives way first (a thousand times as fast), then the rest. */}
              {right.map((x, i) => (
                <Box key={`r${i}`} flexShrink={i === last ? 1000 : 1} minWidth={0} overflow="hidden">
                  {typeof x === 'string' ? (
                    <Text {...R.meta} wrap="truncate">
                      {x}
                    </Text>
                  ) : (
                    x
                  )}
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      )
    }
    return (
      <Box key={key} flexDirection="row" justifyContent="space-between" gap={space.item} paddingLeft={r.indent ?? 0}>
        <Box flexDirection="row" flexShrink={1} minWidth={0} alignItems="center">
          {r.tree ? (
            <Box flexShrink={0}>
              <Text dimColor>{r.tree}</Text>
            </Box>
          ) : null}
          {lead ? (
            <Box width={2} flexShrink={0} flexDirection="row" alignItems="center">
              {lead}
            </Box>
          ) : null}
          <Box flexShrink={1} minWidth={0}>
            <Text wrap="truncate" bold={r.bold} {...(r.dim ? tone('mid') : ink(r.textColor))}>
              {r.text}
              {r.note ? <Text {...tone('mid')} bold={false}>{`  ${r.note}`}</Text> : null}
            </Text>
          </Box>
        </Box>
        {right.length ? (
          <Box flexDirection="row" gap={space.item} flexShrink={0} alignItems="center">
            {right.map((x, i) => (typeof x === 'string' ? <Text key={`r${i}`} {...tone('mid')}>{x}</Text> : x))}
          </Box>
        ) : null}
      </Box>
    )
  }

  /** A tree connector (`TREE` in `@kit/tokens`) for a row at a depth: see `treePrefix`. */
  const tree = (guides: boolean[], last: boolean, depth = guides.length + 1) => treePrefix(guides, last, depth)

  /**
   * A line that stands in for content: `empty` (nothing to list) and `loading`
   * (reading…) dim, `error` a red ✕ (the alert icon on the app surfaces) and the
   * message plain. One line cut at the edge, or with `lines: 2` up to two: on the
   * terminal it breaks between words to fit `width` cells (a section body's by
   * default; pass it when the note sits deeper), and the second line is cut with
   * an ellipsis; on the app surfaces, whose text isn't in cells, it wraps.
   */
  const note = (key: string, text: string, kind: 'empty' | 'loading' | 'error' = 'empty', opts: { lines?: 1 | 2; width?: number } = {}) => {
    const two = opts.lines === 2
    const props = kind === 'error' ? {} : tone('mid')
    const message = (w: number) => {
      if (!two) return <Text {...props} wrap="truncate">{text}</Text>
      if (!terminal) {
        return (
          <Text {...props} wrap="wrap">
            {text}
          </Text>
        )
      }
      const [first, rest] = breakLine(text, w)
      return (
        <Box flexDirection="column" minWidth={0}>
          <Text {...props} wrap="truncate">
            {first}
          </Text>
          {rest ? (
            <Text {...props} wrap="truncate">
              {rest}
            </Text>
          ) : null}
        </Box>
      )
    }
    const w = Math.max(1, Math.floor(opts.width ?? body))
    if (kind !== 'error') {
      return (
        <Box key={key} flexDirection="row" minWidth={0}>
          {message(w)}
        </Box>
      )
    }
    return (
      <Box key={key} flexDirection="row" gap={space.pair} minWidth={0} alignItems={two ? 'flex-start' : 'center'}>
        <Box flexShrink={0}>{terminal ? <Text {...ink(C.bad)}>{STATUS.failed.glyph}</Text> : icon('alert', C.bad)}</Box>
        <Box flexShrink={1} minWidth={0}>
          {message(w - 1 - CELLS.pair)}
        </Box>
      </Box>
    )
  }

  /**
   * One action: a plain button; `quiet` (secondary) dim at rest; `hotkey` a digit
   * or letter that presses it; `autoFocus` holds the focus when the site takes the
   * keyboard, so Enter presses it (give it to the safe choice); `tone: 'danger'`
   * for one that destroys something, its label in the failed colour.
   */
  type Action = { key: string; label: string; onPress: () => void; quiet?: boolean; hotkey?: string; autoFocus?: boolean; tone?: 'danger' }
  const action = (a: Action): RenderElement => {
    const danger = a.tone === 'danger'
    if (!Button) return <Text key={a.key} {...(danger ? ink(C.bad) : a.quiet ? tone('mid') : {})}>{a.label}</Text>
    const hot = { ...(a.hotkey ? { hotkey: a.hotkey } : {}), ...(a.autoFocus ? { autoFocus: true } : {}) }
    // A danger action draws a red Text in its label's place, on every surface; the label stays its name.
    if (danger) {
      return (
        <Button key={a.key} plain label={a.label} {...(terminal && a.quiet ? { dimColor: true } : {})} {...hot} onPress={a.onPress}>
          <Text {...ink(C.bad)}>{a.label}</Text>
        </Button>
      )
    }
    if (terminal) return <Button key={a.key} plain label={a.label} {...(a.quiet ? { dimColor: true } : {})} {...hot} onPress={a.onPress} />
    return a.quiet ? (
      <Button key={a.key} plain {...hot} onPress={a.onPress}>
        <Text color={GRAY.mid}>{a.label}</Text>
      </Button>
    ) : (
      <Button key={a.key} plain label={a.label} {...hot} onPress={a.onPress} />
    )
  }

  /** A row's actions, one cluster: main ones first, quiet ones after, `space.group` apart on the terminal. */
  const actions = (key: string, list: (Action | null | false)[]) => (
    <Box key={key} flexDirection="row" gap={terminal ? CELLS.group : SPACE.item} flexShrink={0} alignItems="center">
      {list.filter((a): a is Action => Boolean(a)).map(action)}
    </Box>
  )

  return {
    icon,
    pinned,
    share,
    tile,
    bar,
    capped,
    rounded,
    scale,
    axis,
    legend,
    caption,
    summary,
    gauge,
    reading,
    rail,
    prop,
    swatch,
    pill,
    section,
    columns: columnsChart,
    perf: perfFooter,
    status,
    item,
    tree,
    note,
    action,
    actions,
    ink,
    space,
    edge,
    /** A section body's width in cells on the terminal: what a bar or gauge spans by default. */
    width: body,
    terminal,
  }
}

export type Kit = ReturnType<typeof kit>
