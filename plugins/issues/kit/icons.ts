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
  // A gauge: a dial three-quarters round, open at the bottom, centred like the
  // other icons (a half dial sat low in its square and read as cut off), and a needle.
  [GLYPH.limits]: '<path d="M3.76 12.24a6 6 0 1 1 8.48 0"/><path d="M8 8l2.6-2.6"/>',
  [GLYPH.cost]: '<circle cx="8" cy="8" r="6"/><path d="M10 6.2c-.4-.8-1.2-1.2-2-1.2-1.1 0-2 .6-2 1.5S6.9 7.8 8 8s2 .6 2 1.5-.9 1.5-2 1.5c-.8 0-1.6-.4-2-1.2M8 4v1M8 11v1"/>',
  // Events: a bolt.
  events: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
}

/**
 * GitHub's own icons for branches and pull requests: Octicons (`@primer/octicons`
 * 19.15.0, `*-16.svg`, MIT, © GitHub Inc.), copied unchanged. Filled shapes, not
 * strokes, so they're drawn filled in the icon's colour.
 */
const FILLED: Record<string, string> = {
  [GLYPH.branch]:
    'M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  'pr-open':
    'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
  'pr-merged':
    'M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z',
  'pr-closed':
    'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  'issue-opened': 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
  comment:
    'M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
  'pr-draft':
    'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z',
}

/** The SVG for an icon (a GLYPH or a name), stroked in `color`; null when the kit has none. */
export const iconSvg = (key: string, color: string, px = ICON_PX): string | null => {
  const filled = FILLED[key]
  if (filled)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16" fill="${color}"><path d="${filled}"/></svg>`
  const body = PATHS[key]
  if (!body) return null
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16" ` +
    `fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )
}
