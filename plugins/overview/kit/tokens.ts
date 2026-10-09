/** The colors every mod draws with: hues that read on a light page, a dark page and a terminal. */
export const C = {
  ok: '#9ece6a',
  bad: '#f7768e',
  warn: '#e0af68',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  cyan: '#7dcfff',
  orange: '#ff9e64',
  teal: '#2ac3de',
} as const

/** Categorical hues, in order: one per series. */
export const PALETTE = [C.blue, C.purple, C.cyan, C.ok, C.warn, C.bad, C.orange, C.teal] as const

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
