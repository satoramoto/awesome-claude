/**
 * The instrument's colours: calibrated, not neon, readable on a light page, a dark
 * page and a terminal. Status is green, amber, red; activity is cobalt; quiet
 * structure is slate. Colour always means something.
 */
export const C = {
  ok: '#5bc08a',
  warn: '#e3a33b',
  bad: '#e5636f',
  blue: '#6c8ef5',
  purple: '#9d85e8',
  cyan: '#4fb3c8',
  orange: '#e3a33b',
  teal: '#4fb3c8',
  slate: '#8c9bb5',
  orchid: '#c58ad6',
} as const

/** Categorical hues, in order: one family of cool tones; the last in a set takes amber when it is the one to watch. */
export const PALETTE = [C.slate, C.blue, C.cyan, C.purple, C.orchid, C.warn, C.ok, C.bad] as const

/** A bar's empty part and other quiet fills: a grey that reads on light and dark. */
export const TRACK = 'rgba(128,128,128,0.18)'

/** Text and marks that should recede. */
export const MUTED = '#8e8e93'

/** Green under 75%, amber from 75%, red from 90%. */
export const levelColor = (percent: number): string => (percent >= 90 ? C.bad : percent >= 75 ? C.warn : C.ok)

/** One glyph per idea, shared so mods read alike. */
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
