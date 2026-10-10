import { GLYPH } from './tokens'

/*
 * The kit's icons: stroked drawings on a 16×16 grid, drawn as SVG at one exact
 * pixel size so every icon is the same height and width and stays crisp (an SVG
 * the page has to scale blurs). Keyed by the glyph each one stands in for, so a
 * component given a GLYPH draws the icon where the surface has SVG, the glyph
 * where it doesn't (the terminal).
 */

/** The icons' drawn size in CSS pixels. */
export const ICON_PX = 13

const PATHS: Record<string, string> = {
  // A pie a quarter cut: how full.
  [GLYPH.context]: '<circle cx="8" cy="8" r="6"/><path d="M8 2v6h6"/>',
  [GLYPH.time]: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
  [GLYPH.turns]: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3.2H9.8"/>',
  [GLYPH.tools]: '<path d="M10.5 2.5a3 3 0 0 0-3.3 4.1L2.6 11.2l2.2 2.2 4.6-4.6a3 3 0 0 0 4.1-3.3l-1.9 1.9-1.9-.4-.4-1.9z"/>',
  [GLYPH.files]: '<path d="M3 13l.9-3.4L10.8 2.7l2.5 2.5-6.9 6.9z"/>',
  [GLYPH.agents]: '<path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/>',
  // A gauge's dial and needle.
  [GLYPH.limits]: '<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0"/><path d="M8 11.5l2.6-3.2"/>',
  [GLYPH.branch]: '<circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><path d="M5 5v6M11 6.5c0 2.6-6 2.2-6 4.5"/>',
  [GLYPH.cost]: '<circle cx="8" cy="8" r="6"/><path d="M10 6.2c-.4-.8-1.2-1.2-2-1.2-1.1 0-2 .6-2 1.5S6.9 7.8 8 8s2 .6 2 1.5-.9 1.5-2 1.5c-.8 0-1.6-.4-2-1.2M8 4v1M8 11v1"/>',
  // Events: a bolt.
  events: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
  // Pull requests, as GitHub draws them: open, merged, closed, draft.
  'pr-open': '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M4.5 5v6M11.5 11V6.5a2 2 0 0 0-2-2H7.5M9 3l-1.5 1.5L9 6"/>',
  'pr-merged': '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="8" r="1.5"/><path d="M4.5 5v6M4.5 5c0 2.5 2.5 3 5.5 3"/>',
  'pr-closed': '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M4.5 5v6M11.5 11V8.5M10 3l3 3M13 3l-3 3"/>',
  'pr-draft': '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M4.5 5v6M11.5 4v.5M11.5 7v.5M11.5 10v.5"/>',
}

/** The SVG for an icon (a GLYPH or a name), stroked in `color`; null when the kit has none. */
export const iconSvg = (key: string, color: string, px = ICON_PX): string | null => {
  const body = PATHS[key]
  if (!body) return null
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16" ` +
    `fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )
}
