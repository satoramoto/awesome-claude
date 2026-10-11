// Turns a mod's render tree into DOM, the way each surface lays it out:
// the app surfaces as flexbox with a cell of COL × ROW pixels, the terminal
// as a monospace grid of 1ch × 1 line.

import { drawClient } from './client'
import type { ClientOptions } from './client'
import { codeBlock, markdownBlock } from './text'

export type Node = { type: string; props: Record<string, any>; children: Child[]; hover?: Record<string, any> }
export type Child = Node | string | number | null | undefined | false | Child[]

/** The JSX fragment tag the mods compile against. */
export const Fragment = 'Fragment'

/** The JSX factory the mods compile against. A function as the tag is called with its props and children. */
export const h = (type: string | ((props: any) => Node), props: Record<string, any> | null, ...children: Child[]): Node => {
  const kids = children.flat(Infinity as 1) as Child[]
  if (typeof type === 'function') return type({ ...(props ?? {}), children: kids })
  return { type, props: props ?? {}, children: kids }
}

export type Surface = 'desktop' | 'terminal'

/** A desktop cell in pixels; calibrated against the real pane (see README). */
export const CELL = { col: 7.8, row: 19 }

/** A terminal row, in em of the terminal's font. */
export const TERMINAL_ROW_EM = 1.25

const THEME: Record<string, string> = {
  text: 'var(--r-fg)',
  inverseText: 'var(--r-bg)',
  claude: '#d77757',
  permission: '#b1b9f9',
  planMode: '#48968c',
  autoAccept: '#af87ff',
  remember: '#b1b9f9',
  ide: '#4782c8',
  promptBorder: '#888888',
  bashBorder: '#fd5db1',
  success: '#30a46c',
  error: '#e5484d',
  warning: '#d9822b',
  suggestion: '#3e63dd',
  merged: '#8e4ec6',
  diffAdded: '#30a46c',
  diffRemoved: '#e5484d',
  diffAddedDimmed: 'color-mix(in srgb, #30a46c 55%, transparent)',
  diffRemovedDimmed: 'color-mix(in srgb, #e5484d 55%, transparent)',
  diffAddedWord: '#46c288',
  diffRemovedWord: '#f2757a',
  inactive: '#8e8e93',
  subtle: '#8e8e93',
}

/** A theme key's color, or the raw color. */
export const color = (v: string) => THEME[v] ?? v

const VERTICAL = new Set(['top', 'bottom', 'height', 'minHeight', 'marginTop', 'marginBottom', 'marginY', 'paddingTop', 'paddingBottom', 'paddingY', 'rowGap'])

/** A size prop as CSS: cells as pixels (desktop) or ch / lines (terminal); strings, such as percentages, as written. */
export const unit = (surface: Surface, key: string, v: unknown) => {
  if (typeof v !== 'number') return String(v)
  if (surface === 'terminal') return VERTICAL.has(key) ? `${v * TERMINAL_ROW_EM}em` : `${v}ch`
  return `${v * (VERTICAL.has(key) ? CELL.row : CELL.col)}px`
}

const kebab = (k: string) => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

const borderOf = (surface: Surface, style: string, c: string | undefined, dim: boolean | undefined) => {
  const width = style === 'bold' ? 2 : style === 'double' ? 3 : 1
  const paint = color(c ?? 'currentColor')
  const css: Record<string, string> = { border: `${width}px ${style === 'double' ? 'double' : 'solid'} ${dim ? `color-mix(in srgb, ${paint} 50%, transparent)` : paint}` }
  css.borderRadius = style === 'round' ? (surface === 'terminal' ? '0.4em' : '8px') : '0'
  return css
}

const boxStyle = (surface: Surface, p: Record<string, any>) => {
  // border-box, as the desktop measures: padding and borders sit inside a box's width.
  // No minWidth by default: as on the desktop, a box doesn't shrink below its content
  // unless it's given `minWidth={0}`, so text that doesn't fit runs past the edge.
  // Every box is positioned, as Yoga's are, so an absolute child is placed against its parent.
  const s: Record<string, string> = { display: p.display === 'none' ? 'none' : 'flex', flexDirection: p.flexDirection ?? 'column', boxSizing: 'border-box', position: 'relative' }
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || k === 'key' || k === 'hover' || k === 'display' || k === 'children') continue
    if (k === 'marginX' || k === 'paddingX') {
      const base = k.startsWith('margin') ? 'margin' : 'padding'
      s[`${base}Left`] = s[`${base}Right`] = unit(surface, base, v)
    } else if (k === 'marginY' || k === 'paddingY') {
      const base = k.startsWith('margin') ? 'margin' : 'padding'
      s[`${base}Top`] = s[`${base}Bottom`] = unit(surface, k, v)
    } else if (k === 'backgroundColor') s.background = color(v)
    else if (k === 'borderStyle') {
      // The desktop draws these; `dashed` it ignores.
      if (v === 'dashed') continue
      Object.assign(s, borderOf(surface, v, p.borderColor, p.borderDimColor))
    }
    else if (k === 'borderColor' || k === 'borderDimColor') continue
    else if (/^(flexGrow|flexShrink)$/.test(k)) s[k] = String(v)
    else if (/^(flexDirection|flexWrap|alignItems|alignSelf|justifyContent|overflow|position)$/.test(k)) s[k] = String(v)
    else s[k] = unit(surface, k, v)
  }
  return s
}

const textStyle = (p: Record<string, any>) => {
  // The desktop keeps a Text on one line: it runs past its box rather than wrapping.
  const s: Record<string, string> = { whiteSpace: 'nowrap' }
  let fg = p.color ? color(p.color) : undefined
  let bg = p.backgroundColor ? color(p.backgroundColor) : undefined
  if (p.inverse) [fg, bg] = [bg ?? 'var(--r-bg)', fg ?? 'var(--r-fg)']
  if (fg) s.color = fg
  if (bg) s.background = bg
  if (p.dimColor) s.opacity = '0.6'
  else if (p.dimColor === false) s.opacity = '1'
  if (p.bold) s.fontWeight = '600'
  else if (p.bold === false) s.fontWeight = 'normal'
  if (p.italic) s.fontStyle = 'italic'
  else if (p.italic === false) s.fontStyle = 'normal'
  const lines = [p.underline && 'underline', p.strikethrough && 'line-through'].filter(Boolean)
  if (lines.length) s.textDecoration = lines.join(' ')
  else if (p.underline === false || p.strikethrough === false) s.textDecoration = 'none'
  if (typeof p.wrap === 'string' && p.wrap.startsWith('truncate')) Object.assign(s, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0' })
  if (p.wrap === 'truncate-start') s.direction = 'rtl'
  return s
}

const apply = <E extends HTMLElement>(el: E, style: Record<string, string>) => {
  for (const [k, v] of Object.entries(style)) el.style.setProperty(kebab(k), v)
  return el
}

// ---- hover ----

/** An element a hover restyles: `on` applies its hover, `off` restores it; `born` is the task that drew it. */
type Member = { el: HTMLElement; on: () => void; off: () => void; born: number }
/** The nearest keyed Box: its members light while the pointer is over it. */
type Scope = { members: Member[] }

/**
 * Counts tasks that drew, so what was drawn in this task and is not on the page
 * yet (the host inserts it once the draw returns) isn't taken for discarded.
 */
let generation = 0
let turning = false
const now = () => {
  if (!turning) {
    turning = true
    queueMicrotask(() => {
      generation++
      turning = false
    })
  }
  return generation
}

type Group = { members: Set<Member>; hot: Set<Element> }

/**
 * The hover groups `hover.scope` names, per drawing site (surface and site):
 * as the engine keeps a plugin's groups to its own drawing, two panes or two
 * stories under one scope name never light each other.
 */
const groups = new Map<string, Group>()

const groupOf = (site: string, name: string) => {
  const id = `${site}\u0000${name}`
  let g = groups.get(id)
  if (!g) groups.set(id, (g = { members: new Set(), hot: new Set() }))
  return g
}

/** Drops what a redraw discarded: hot elements off the page, members off the page from an earlier draw. */
const prune = (g: Group) => {
  for (const el of [...g.hot]) if (!el.isConnected) g.hot.delete(el)
  for (const m of [...g.members]) if (!m.el.isConnected && m.born < generation) g.members.delete(m)
}

const relight = (g: Group) => {
  prune(g)
  for (const m of g.members) {
    if (!m.el.isConnected) continue
    if (g.hot.size) m.on()
    else m.off()
  }
}

/** Calls `enter` while the pointer is over `el`, and at once if it already rests there once drawn. */
const watch = (el: HTMLElement, enter: () => void, leave: () => void) => {
  el.addEventListener('mouseenter', enter)
  el.addEventListener('mouseleave', leave)
  // Once the host has put the drawing on the page (the same task, usually), else the next frame.
  const check = () => {
    if (el.isConnected && el.matches(':hover')) enter()
  }
  queueMicrotask(check)
  requestAnimationFrame(check)
}

/** A member whose hover style is `lit()`, restored to what it was drawn with. */
const member = (el: HTMLElement, lit: () => Record<string, string>): Member => {
  let base: string | null = null
  return {
    el,
    born: now(),
    on: () => {
      if (base === null) base = el.style.cssText
      el.style.cssText = base
      apply(el, lit())
    },
    off: () => {
      if (base !== null) el.style.cssText = base
    },
  }
}

/** Joins `m` to its `scope` group (given one) or the nearest keyed Box's scope. */
const join = (m: Member, hover: Record<string, any>, scope: Scope | null, site: string) => {
  if (typeof hover.scope === 'string' && hover.scope) {
    const g = groupOf(site, hover.scope)
    prune(g)
    g.members.add(m)
    // The element heats its group too.
    watch(
      m.el,
      () => {
        g.hot.add(m.el)
        relight(g)
      },
      () => {
        g.hot.delete(m.el)
        relight(g)
      },
    )
    // Drawn while its group is lit (a redraw under a resting pointer): lit from the start, no flicker.
    // After the draw finishes, so the base it restores includes what the parent sets (an inline Text).
    if (g.hot.size) queueMicrotask(() => g.hot.size && m.on())
    return
  }
  scope?.members.push(m)
}

const without = (o: Record<string, any>, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** What a Box's hover may change: borders it has, its background, a reveal, a placed Box's offsets. */
const boxHover = (p: Record<string, any>, hover: Record<string, any>) => {
  const h: Record<string, any> = {}
  if (p.borderStyle && p.borderStyle !== 'dashed') for (const k of ['borderStyle', 'borderColor', 'borderDimColor']) if (k in hover) h[k] = hover[k]
  if ('backgroundColor' in hover) h.backgroundColor = hover.backgroundColor
  if (hover.display === 'flex' && p.display === 'none') h.display = 'flex'
  if (p.position === 'absolute') for (const k of ['top', 'left', 'right', 'bottom']) if (k in hover) h[k] = hover[k]
  return h
}

// ---- styles the drawn elements share ----

let styled = false
const injectStyles = () => {
  if (styled || typeof document === 'undefined') return
  styled = true
  const style = document.createElement('style')
  style.dataset.render = ''
  style.textContent = STYLES
  // First in <head>, so a host's own rules (the pane, the link colour) still win where they overlap.
  document.head.prepend(style)
}

const STYLES = `
  :root, .dark { --r-bg: #1f1f1e; --r-fg: #ececec; --r-accent: #0a84ff; --r-field: rgba(255,255,255,0.06); --r-edge: rgba(255,255,255,0.16); --r-btn: rgba(255,255,255,0.14); --r-btn-top: rgba(255,255,255,0.08); --r-code: rgba(255,255,255,0.05); --r-kw: #c792ea; --r-str: #a5d6a7; --r-num: #f2b179; --r-add: rgba(48,164,108,0.18); --r-del: rgba(229,72,77,0.18); }
  .light { --r-bg: #fbfbfa; --r-fg: #1d1d1f; --r-accent: #007aff; --r-field: #ffffff; --r-edge: rgba(0,0,0,0.16); --r-btn: #ffffff; --r-btn-top: rgba(0,0,0,0); --r-code: rgba(0,0,0,0.04); --r-kw: #8e3fbf; --r-str: #2f7d32; --r-num: #b5651d; --r-add: rgba(48,164,108,0.14); --r-del: rgba(229,72,77,0.12); }
  .app.dark { --r-bg: #1c1c1c; --r-fg: #e8e8e6; }
  .app.light { --r-bg: #faf9f5; --r-fg: #1f1e1d; }
  .terminal { --r-bg: #101014; --r-fg: #d8d8d8; --r-accent: #d77757; --r-field: transparent; --r-edge: #5a5a5a; --r-code: transparent; --r-kw: #c792ea; --r-str: #a5d6a7; --r-num: #f2b179; --r-add: rgba(48,164,108,0.22); --r-del: rgba(229,72,77,0.22); }

  /* A desktop's native push button, after macOS's: a rounded bezel, the primary filled with the accent. */
  .button.native { font: inherit; font-size: 12.5px; line-height: 17px; padding: 0 9px; border-radius: 5px; color: var(--r-fg); background: var(--r-btn); border: 0.5px solid var(--r-edge); box-shadow: inset 0 0.5px 0 var(--r-btn-top), 0 0.5px 1.5px rgba(0,0,0,0.18); cursor: default; white-space: nowrap; flex-shrink: 0; align-self: flex-start; }
  .button.native:active { filter: brightness(0.9); }
  .button.native.primary { background: var(--r-accent); color: #fff; border-color: transparent; }
  .button.native:focus-visible, .r-client:focus-visible { outline: 2px solid color-mix(in srgb, var(--r-accent) 60%, transparent); outline-offset: 1px; }
  .button.dim:hover, .button.dim:focus-visible { opacity: 1 !important; }
  .button.terminal { font: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; white-space: pre; text-align: left; }
  .button.terminal:hover, .button.terminal:focus-visible { background: var(--r-fg); color: var(--r-bg); outline: none; }
  .button.terminal.primary { color: var(--r-accent); }
  .button.terminal.primary:hover, .button.terminal.primary:focus-visible { color: var(--r-bg); background: var(--r-accent); }
  .button .hotkey { color: var(--r-accent); }
  /* The desktop's close control, drawn where a dismiss Button sits. */
  .button.dismiss { width: 18px; height: 18px; padding: 0; border: none; border-radius: 50%; background: transparent; color: var(--r-fg); opacity: 0.6; font-size: 11px; line-height: 18px; text-align: center; cursor: default; align-self: flex-end; flex-shrink: 0; }
  .button.dismiss:hover { opacity: 1; background: var(--r-btn); }

  .r-field { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .r-field input, .r-field select { font: inherit; color: inherit; min-width: 0; }
  .r-field.desktop input { flex: 1; height: 19px; box-sizing: border-box; padding: 0 6px; border-radius: 5px; border: 0.5px solid var(--r-edge); background: var(--r-field); outline: none; }
  .r-field.desktop input:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--r-accent) 45%, transparent); border-color: var(--r-accent); }
  .r-field.desktop select { height: 19px; padding: 0 4px; border-radius: 5px; border: 0.5px solid var(--r-edge); background: var(--r-btn); }
  .r-field.terminal input { flex: 1; border: none; border-bottom: 1px dotted var(--r-edge); background: transparent; padding: 0; outline: none; }
  .r-field.terminal input:focus { border-bottom-color: var(--r-accent); }
  .r-field.terminal select { appearance: none; border: none; background: transparent; padding: 0; outline: none; color: var(--r-accent); }
  .r-field .r-submit { opacity: 0.6; display: none; }
  .r-field:focus-within .r-submit { display: inline; }

  .r-code { margin: 0; font: 12px/1.45 'SF Mono', Menlo, monospace; background: var(--r-code); border-radius: 6px; padding: 4px 0; overflow: hidden; }
  .terminal .r-code { font: inherit; padding: 0; border-radius: 0; }
  .r-code .ln { display: flex; padding: 0 8px; }
  .terminal .r-code .ln { padding: 0; }
  .r-code .g { flex: none; opacity: 0.45; text-align: right; padding-right: 1ch; user-select: none; }
  .r-code .m { flex: none; width: 2ch; user-select: none; }
  .r-code .src { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .r-code.trunc .src { white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .r-code .add { background: var(--r-add); }
  .r-code .add .m { color: #30a46c; }
  .r-code .del { background: var(--r-del); }
  .r-code .del .m { color: #e5484d; }
  .r-code .hunk { opacity: 0.55; }
  .r-code .kw { color: var(--r-kw); }
  .r-code .str { color: var(--r-str); }
  .r-code .num { color: var(--r-num); }
  .r-code .com { opacity: 0.55; font-style: italic; }

  .r-md { white-space: normal; overflow-wrap: anywhere; }
  .r-md > :first-child { margin-top: 0; }
  .r-md > :last-child { margin-bottom: 0; }
  .r-md p, .r-md ul, .r-md ol, .r-md pre, .r-md blockquote { margin: 0 0 8px; }
  .r-md h1, .r-md h2, .r-md h3, .r-md h4, .r-md h5, .r-md h6 { margin: 10px 0 6px; font-weight: 600; line-height: 1.3; }
  .r-md h1 { font-size: 1.35em; } .r-md h2 { font-size: 1.2em; } .r-md h3 { font-size: 1.05em; } .r-md h4, .r-md h5, .r-md h6 { font-size: 1em; }
  .r-md ul, .r-md ol { padding-left: 20px; }
  .r-md code { font: 0.92em 'SF Mono', Menlo, monospace; background: var(--r-code); padding: 0 3px; border-radius: 4px; }
  .r-md pre { font: 12px/1.45 'SF Mono', Menlo, monospace; background: var(--r-code); padding: 6px 8px; border-radius: 6px; white-space: pre-wrap; }
  .r-md pre code { background: none; padding: 0; font: inherit; }
  .r-md blockquote { padding-left: 10px; border-left: 2px solid var(--r-edge); opacity: 0.8; }
  .r-md hr { border: none; border-top: 1px solid var(--r-edge); margin: 8px 0; }
  .r-md a { color: #6e8efb; }
  .terminal .r-md h1, .terminal .r-md h2, .terminal .r-md h3, .terminal .r-md h4 { font-size: 1em; margin: 0; }
  .terminal .r-md p, .terminal .r-md ul, .terminal .r-md ol, .terminal .r-md pre, .terminal .r-md blockquote { margin: 0 0 ${TERMINAL_ROW_EM}em; }
  .terminal .r-md code, .terminal .r-md pre { font: inherit; background: none; padding: 0; color: var(--r-kw); }
  .terminal .r-md ul, .terminal .r-md ol { padding-left: 0; list-style-position: inside; }

  .r-raster { font: inherit; line-height: ${TERMINAL_ROW_EM}em; white-space: pre; flex-shrink: 0; overflow: hidden; }
  .r-image { flex-shrink: 0; display: block; object-fit: fill; }
  .r-image.blank { display: flex; align-items: center; justify-content: center; opacity: 0.6; outline: 1px dashed var(--r-edge); outline-offset: -1px; overflow: hidden; }
  .r-client { position: relative; display: flex; flex-direction: column; outline: none; touch-action: none; }
  .r-client .r-unmounted { opacity: 0.6; white-space: nowrap; }
`

// ---- Svg ----

/** As the engine's scrub: no script elements, no event-handler attributes, no javascript: URLs. */
export const scrub = (svg: string) =>
  svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href\s*=\s*["']?)\s*javascript:[^"'\s>]*/gi, '$1#')

/** The markup's own size: its width and height attributes, or its viewBox. */
const svgSize = (svg: string): { width?: number; height?: number } => {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const num = (name: string) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']?([\\d.]+)(px)?["'\\s>/]`, 'i'))
    return m ? Number(m[1]) : undefined
  }
  const box = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  return { width: num('width') ?? (box ? Number(box[1]) : undefined), height: num('height') ?? (box ? Number(box[2]) : undefined) }
}

const drawSvg = (p: Record<string, any>) => {
  const source = scrub(String(p.source ?? ''))
  if (!p.isInteractive) {
    // As the desktop draws it: an image at the given pixel size.
    const img = document.createElement('img')
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    img.alt = p.alt ?? ''
    if (p.width !== undefined) img.width = p.width
    if (p.height !== undefined) img.height = p.height
    img.style.display = 'block'
    img.style.flexShrink = '0'
    return img
  }
  // As the desktop draws `isInteractive`: a frame with no script, so SMIL, CSS
  // animation, :hover and <title> tooltips run, and nothing reaches the page.
  const own = svgSize(source)
  const ratio = own.width && own.height ? own.height / own.width : undefined
  const width: number = p.width ?? (p.height !== undefined && ratio ? p.height / ratio : own.width) ?? 300
  const height: number = p.height ?? (ratio ? width * ratio : own.height) ?? 150
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', '')
  frame.title = p.alt ?? ''
  frame.width = String(width)
  frame.height = String(height)
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}body>svg{display:block;width:${width}px;height:${height}px}</style>${source}`
  // The same color scheme inside and out, or the browser paints the frame opaque.
  apply(frame, { display: 'block', flexShrink: '0', border: '0', background: 'transparent', colorScheme: 'normal', width: `${width}px`, height: `${height}px` })
  return frame
}

// ---- Raster and Image ----

const b64bytes = (b64: string) => {
  try {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

const rgb = (c: number) => (c & 0x01000000 ? undefined : `#${(c & 0xffffff).toString(16).padStart(6, '0')}`)

/** A Raster as rows of cells, each run of one color pair a span. */
const drawRaster = (p: Record<string, any>) => {
  const columns = Math.max(1, Math.min(512, Number(p.columns) || 1))
  const rows = Math.max(1, Math.min(256, Number(p.rows) || 1))
  const bytes = b64bytes(String(p.cells ?? ''))
  const words = new Uint32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4))
  const el = apply(document.createElement('div'), { width: `${columns}ch`, height: `${rows * TERMINAL_ROW_EM}em` })
  el.className = 'r-raster'
  for (let y = 0; y < rows; y++) {
    const row = document.createElement('div')
    let run: HTMLSpanElement | null = null
    let key = ''
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 3
      const cp = words[i] ?? 0x20
      const fg = rgb(words[i + 1] ?? 0x01000000)
      const bg = rgb(words[i + 2] ?? 0x01000000)
      const k = `${fg}|${bg}`
      if (!run || k !== key) {
        run = document.createElement('span')
        if (fg) run.style.color = fg
        if (bg) run.style.background = bg
        row.append(run)
        key = k
      }
      run.textContent += String.fromCodePoint(cp >= 0x20 && cp <= 0xffff ? cp : 0x20)
    }
    el.append(row)
  }
  return el
}

/** An Image as the picture, scaled to fill its cells; a name the page can't read, a blank box with the alt. */
const drawImage = (p: Record<string, any>) => {
  const size = { width: `${Number(p.columns) || 1}ch`, height: `${(Number(p.rows) || 1) * TERMINAL_ROW_EM}em` }
  const s = p.source ?? {}
  let src: string | undefined
  if (typeof s.png === 'string') src = `data:image/png;base64,${s.png}`
  else if (typeof s.rgba === 'string' && s.width > 0 && s.height > 0) {
    const canvas = document.createElement('canvas')
    canvas.width = s.width
    canvas.height = s.height
    const bytes = b64bytes(s.rgba)
    const ctx = canvas.getContext('2d')
    if (ctx && bytes.length >= s.width * s.height * 4) {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, 0, s.width * s.height * 4), s.width, s.height), 0, 0)
      src = canvas.toDataURL()
    }
  }
  if (!src) {
    // A file or shared-memory name: the terminal reads it, the page can't.
    const blank = apply(document.createElement('div'), size)
    blank.className = 'r-image blank'
    blank.textContent = p.alt ?? ''
    return blank
  }
  const img = apply(document.createElement('img'), size)
  img.className = 'r-image'
  img.src = src
  img.alt = p.alt ?? ''
  return img
}

// ---- form fields ----

/** What the person typed into each Input, by site and key, kept until the hook draws a different value. */
const typed = new Map<string, { drawn: string | undefined; value: string }>()
/** The Input that had the focus (site and key), so a redraw of that site while typing keeps it. */
let focused: { id: string; el: HTMLInputElement; start: number | null; end: number | null } | null = null

// ---- hotkeys ----

/**
 * A Button's hotkey presses it while its site holds the focus: the site the
 * person last clicked or focused in, by the `data-r-site` its drawing's root
 * elements carry. So one story's or pane's hotkey never fires another's.
 */
const hotkeys: { site: string; key: string; el: HTMLElement; run: () => void; born: number }[] = []
let activeSite: string | null = null
let hotkeysWired = false
/** Drops the hotkeys of buttons a redraw of `site` discarded. */
const pruneHotkeys = (site: string) => {
  for (let i = hotkeys.length - 1; i >= 0; i--) {
    const h = hotkeys[i]!
    if (h.site === site && !h.el.isConnected && h.born < generation) hotkeys.splice(i, 1)
  }
}
const wireHotkeys = () => {
  if (hotkeysWired) return
  hotkeysWired = true
  const take = (e: Event) => {
    const t = e.target as Element | null
    activeSite = (t?.closest?.('[data-r-site]') as HTMLElement | null)?.dataset.rSite ?? null
  }
  document.addEventListener('pointerdown', take, true)
  document.addEventListener('focusin', take, true)
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !activeSite) return
    const t = e.target as HTMLElement | null
    if (t?.closest?.('input, textarea, select, [contenteditable], .r-client')) return
    const key = e.key.toLowerCase()
    for (let i = hotkeys.length - 1; i >= 0; i--) if (!hotkeys[i]!.el.isConnected) hotkeys.splice(i, 1)
    // Two on one hotkey: the later wins.
    const hit = [...hotkeys].reverse().find(h => h.key === key && h.site === activeSite)
    if (!hit) return
    e.preventDefault()
    hit.run()
  })
}

// ---- drawing ----

export type DrawOptions = {
  /**
   * Names the drawing (a pane, a story: Storybook's `ctx.id`): hover groups,
   * hotkeys, typed text and Client instances are kept per site. Defaults to
   * `client.site`, else a fresh name per draw.
   */
  site?: string
  /** Where a `Client` finds its module and sends its posts; see playground/client.ts. */
  client?: ClientOptions
}

type Ctx = { surface: Surface; press: (fn: () => void) => void; scope: Scope | null; opts: DrawOptions; inClient: boolean; site: string }

let draws = 0

/** Marks the drawing's root elements with its site, which the hotkeys read. */
const root = (drawn: globalThis.Node | null, site: string) => {
  const els = drawn instanceof DocumentFragment ? [...drawn.children] : drawn instanceof HTMLElement ? [drawn] : []
  for (const el of els) (el as HTMLElement).dataset.rSite = site
  return drawn
}

const start = (site: string) => {
  now()
  // A field focused in another site and gone from the page is no longer anyone's to restore,
  // so a new story drawing an Input under the same key doesn't take the focus.
  if (focused && !focused.id.startsWith(`${site}\u0000`) && !focused.el.isConnected) focused = null
  // What the person typed stays per site; past a few hundred fields, the oldest go.
  for (const k of [...typed.keys()].slice(0, Math.max(0, typed.size - 200))) typed.delete(k)
  pruneHotkeys(site)
}

/** Draws `node` for `surface`; `press` runs a Button's onPress (and an Input's, a Select's or a Markdown link's handler). */
export const draw = (node: Child, surface: Surface, press: (fn: () => void) => void, opts: DrawOptions = {}): globalThis.Node | null => {
  injectStyles()
  const name = opts.site ?? opts.client?.site
  const site = `${surface}|${name ?? `draw-${++draws}`}`
  const client: ClientOptions = name === undefined ? { ...opts.client } : { ...opts.client, site: name }
  start(site)
  return root(paint(node, { surface, press, scope: null, opts: { ...opts, client }, inClient: false, site }), site)
}

/** Draws a Client's tree into its region (`site` names the instance): the Client's own press, no nested Client. */
export const drawInClient = (node: Child, surface: Surface, press: (fn: () => void) => void, site: string): globalThis.Node | null => {
  start(site)
  return root(paint(node, { surface, press, scope: null, opts: {}, inClient: true, site }), site)
}

const textOf = (c: Child): string =>
  c === null || c === undefined || c === false ? '' : Array.isArray(c) ? c.map(textOf).join('') : typeof c === 'object' ? (c.children ?? []).map(textOf).join('') : String(c)

const paint = (node: Child, ctx: Ctx): globalThis.Node | null => {
  if (node === null || node === undefined || node === false) return null
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node))
  if (Array.isArray(node)) return fragment(node, ctx)
  const { surface } = ctx
  const children = node.children ?? []
  const kids = (c: Ctx = ctx) => children.map(k => paint(k, c)).filter((d): d is globalThis.Node => d !== null)
  const p = node.props ?? {}
  const hover: Record<string, any> | undefined = p.hover ?? node.hover
  switch (node.type) {
    case 'Fragment':
      return fragment(children, ctx)
    case 'Box': {
      const el = apply(document.createElement('div'), boxStyle(surface, p))
      // A keyed Box is a hover scope for itself and what is beneath it.
      const own: Scope | null = typeof p.key === 'string' && p.key ? { members: [] } : null
      if (hover) {
        const lit = boxHover(p, hover)
        join(member(el, () => boxStyle(surface, { ...p, ...lit })), hover, own ?? ctx.scope, ctx.site)
      }
      withKids(el, kids({ ...ctx, scope: own ?? ctx.scope }))
      if (own) watch(el, () => own.members.forEach(m => m.on()), () => own.members.forEach(m => m.off()))
      return el
    }
    case 'Text': {
      const el = apply(document.createElement('span'), { display: 'block', ...textStyle(p) })
      if (hover) join(member(el, () => textStyle({ ...p, ...without(hover, 'scope') })), hover, ctx.scope, ctx.site)
      return withKids(el, kids(), true)
    }
    case 'Link': {
      const a = document.createElement('a')
      a.href = p.href
      a.target = '_blank'
      a.rel = 'noreferrer'
      a.className = 'link'
      const inner = kids()
      if (inner.length) withKids(a, inner, true)
      else a.textContent = p.label ?? p.href
      return a
    }
    case 'Button':
      return button(node, ctx, kids())
    case 'Svg':
      return surface === 'terminal' ? null : drawSvg(p)
    case 'Code':
      return codeBlock(p, surface)
    case 'Markdown':
      return markdownBlock(p, surface, ctx.press)
    case 'Input':
      return input(p, ctx)
    case 'Select':
      return select(p, ctx)
    case 'Raster':
      // Terminal only for now; elsewhere a fragment.
      return surface === 'terminal' ? drawRaster(p) : null
    case 'Image':
      return surface === 'terminal' ? drawImage(p) : null
    case 'Client':
      // No Client nests in a Client.
      return ctx.inClient ? null : drawClient(p, surface, ctx.opts.client ?? {})
    default:
      return withKids(document.createElement('div'), kids())
  }
}

const fragment = (nodes: Child[], ctx: Ctx) => {
  const frag = document.createDocumentFragment()
  for (const c of nodes) {
    const d = paint(c, ctx)
    if (d) frag.append(d)
  }
  return frag
}

const button = (node: Node, ctx: Ctx, children: globalThis.Node[]) => {
  const { surface } = ctx
  const p = node.props ?? {}
  const hover: Record<string, any> | undefined = p.hover ?? node.hover
  const b = document.createElement('button')
  b.type = 'button'
  const label: string = p.label ?? textOf(node.children ?? [])
  const run = () => ctx.press(() => p.onPress?.({ surface, element: p.key ?? label }))
  const body = (into: HTMLElement) => (children.length ? withKids(into, children, true) : into.append(label))
  if (surface === 'terminal') {
    // `plain` wins: a plain Button draws the same whatever its variant.
    b.className = `button terminal${p.variant === 'primary' && !p.plain ? ' primary' : ''}`
    if (p.plain) {
      // As a survey's row: the hotkey in the accent colour, a colon, the label.
      if (p.hotkey) b.append(Object.assign(document.createElement('span'), { className: 'hotkey', textContent: p.hotkey }), ': ')
      body(b)
    } else {
      b.append('[ ')
      body(b)
      b.append(' ]')
    }
  } else if (p.role === 'dismiss') {
    // The desktop's own close control, the label its accessible name.
    b.className = 'button dismiss'
    b.setAttribute('aria-label', label)
    b.title = label
    b.textContent = '✕'
  } else if (p.plain) {
    // Chromeless on purpose: the docs say a desktop draws its native button either way,
    // but the app as we see it draws a plain Button as its label alone.
    b.className = 'button plain'
    body(b)
  } else {
    b.className = `button native${p.variant === 'primary' ? ' primary' : ''}`
    body(b)
  }
  if (p.dimColor) {
    b.classList.add('dim')
    b.style.opacity = '0.6'
  }
  if (hover) join(member(b, () => textStyle(without(hover, 'scope'))), hover, ctx.scope, ctx.site)
  b.onclick = run
  if (typeof p.hotkey === 'string' && /^[0-9a-z]$/.test(p.hotkey)) {
    wireHotkeys()
    pruneHotkeys(ctx.site)
    hotkeys.push({ site: ctx.site, key: p.hotkey, el: b, run, born: now() })
  }
  return b
}

const input = (p: Record<string, any>, ctx: Ctx) => {
  const { surface } = ctx
  const key = String(p.key ?? '')
  const wrap = document.createElement('label')
  wrap.className = `r-field ${surface}`
  if (p.label) wrap.append(Object.assign(document.createElement('span'), { textContent: p.label }))
  const field = document.createElement('input')
  field.type = 'text'
  field.placeholder = p.placeholder ?? ''
  // The person's typing stands until the hook draws another value; kept per site and key.
  const id = `${ctx.site}\u0000${key}`
  const kept = typed.get(id)
  field.value = kept && kept.drawn === p.value ? kept.value : (p.value ?? '')
  typed.delete(id)
  typed.set(id, { drawn: p.value, value: field.value })
  const arg = (kind: 'change' | 'submit') => ({ surface, element: key, kind, value: field.value })
  const hold = () => (focused = { id, el: field, start: field.selectionStart, end: field.selectionEnd })
  field.oninput = () => {
    typed.set(id, { drawn: p.value, value: field.value })
    hold()
    ctx.press(() => p.onInput?.(field.value, arg('change')))
  }
  field.onkeydown = ev => {
    if (ev.key === 'Enter') ctx.press(() => p.onSubmit?.(field.value, arg('submit')))
    if (ev.key === 'Escape') field.blur()
  }
  field.onfocus = hold
  field.onblur = () => {
    // A blur because the field left the page (a redraw) keeps the focus to restore.
    if (field.isConnected && focused?.el === field) focused = null
  }
  wrap.append(field)
  wrap.append(Object.assign(document.createElement('span'), { className: 'r-submit', textContent: `↵ ${p.submitLabel ?? 'submit'}` }))
  // A redraw while typing keeps the focus and the caret.
  if (focused?.id === id) {
    const { start, end, el: was } = focused
    requestAnimationFrame(() => {
      // Only where this field replaced the focused one, on the page.
      if (!field.isConnected || was.isConnected) return
      focused = { id, el: field, start, end }
      field.focus()
      if (start !== null) field.setSelectionRange(start, end)
    })
  }
  return wrap
}

const select = (p: Record<string, any>, ctx: Ctx) => {
  const { surface } = ctx
  const wrap = document.createElement('label')
  wrap.className = `r-field ${surface}`
  if (p.label) wrap.append(Object.assign(document.createElement('span'), { textContent: surface === 'terminal' ? `${p.label}:` : p.label }))
  const sel = document.createElement('select')
  for (const o of (p.options ?? []) as { value: string; label?: string; description?: string }[]) {
    const opt = new Option(o.label ?? o.value, o.value)
    if (o.description) opt.title = o.description
    sel.append(opt)
  }
  if (p.value !== undefined) sel.value = p.value
  sel.onchange = () => ctx.press(() => p.onSelect?.(sel.value, { surface, element: p.key, value: sel.value }))
  wrap.append(sel)
  if (surface === 'terminal') wrap.append(Object.assign(document.createElement('span'), { textContent: '▾', style: 'opacity:0.6' }))
  return wrap
}

/** Inline spans inside a Text, block for the outer one. */
const withKids = (el: HTMLElement, kids: globalThis.Node[], text = false) => {
  for (const k of kids) {
    if (text && k instanceof HTMLElement && k.tagName === 'SPAN') k.style.display = 'inline'
    el.append(k)
  }
  return el
}
