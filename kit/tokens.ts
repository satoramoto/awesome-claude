/**
 * The instrument's colours. Each hue means one thing, everywhere:
 *
 * - grey (MUTED): labels, icons, git marks, ordinary values
 * - slate (INK): "how much" — bars and gauges that only measure
 * - blue: live or in progress — running, pending, the activity series
 * - amber: getting close to a limit — 75% and up, the compaction mark
 * - red: failed, conflicted, 90% and up
 * - green: finished well — checks passed, an agent done
 * - purple: merged
 *
 * Cyan and orchid aren't statuses: they only tint parts within one chart.
 */
export const C = {
  ok: '#5bc08a',
  warn: '#e3a33b',
  bad: '#e5636f',
  blue: '#6c8ef5',
  purple: '#9d85e8',
  cyan: '#4fb3c8',
  slate: '#8c9bb5',
  orchid: '#c58ad6',
} as const

/** Quantity ink: what a bar or gauge is drawn in when it only says how much. */
export const INK = C.slate

/** Shades within one chart: parts of one thing, told apart without new meanings. */
export const RAMP = {
  blue: ['#6c8ef5', '#4c68c9', '#a9bbf9', '#38509e'],
  slate: ['#8c9bb5', '#6f7c93', '#a7b2c6', '#5b667a'],
} as const

/** A bar's empty part and other quiet fills: a grey that reads on light and dark. */
export const TRACK = 'rgba(128,128,128,0.18)'

/** Text, icons and marks that should recede. */
export const MUTED = '#8e8e93'

/**
 * Three greys for text below the main text, each a step quieter, so a row can say
 * what matters most without colour (tuned for the desktop's dark pane):
 * - light: secondary text a reader still reads (a linked PR's title, a byline);
 * - mid: metadata scanned past (ages, counts, secondary actions);
 * - dark: the quietest marks (an icon beside a count, a heading over a list).
 */
export const GRAY = { light: '#b9b9b6', mid: '#8a8a87', dark: '#62625f' } as const

/** Slate under 75%, amber from 75%, red from 90%: colour only once it matters. */
export const levelColor = (percent: number): string => (percent >= 90 ? C.bad : percent >= 75 ? C.warn : INK)

/** One glyph per idea, shared so mods read alike (the SVG icons are keyed by these). */
export const GLYPH = {
  context: '◕',
  cost: '$',
  time: '◷',
  turns: '↻',
  tools: '⚒',
  files: '✎',
  agents: '✦',
  limits: '◔',
  layers: '▤',
  branch: '⎇',
  pr: '⇡',
  running: '◐',
  done: '✓',
  failed: '✕',
  stopped: '■',
  pending: '◌',
  up: '↑',
  down: '↓',
} as const
