const trim = (n: number) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''))

/** Token counts: 950, 1.2k, 84k, 1M. */
export const tokens = (n: number): string => {
  if (n >= 999_500) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}k`
  return String(Math.round(n))
}

/** A duration to the second: 12s, 3m 05s, 2h 05m. */
export const duration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1_000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** A duration at a glance: 47m, 2h05, 3d4h. */
export const short = (ms: number): string => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

/** US dollars: $1.50, $123. */
export const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/** `value` as a whole percent of `max`, clamped: the desktop takes whole percentages only. */
export const pct = (value: number, max: number) => `${Math.round(Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100)))}%`

/** The last path segment. */
export const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
