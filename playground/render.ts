// Turns a mod's render tree into DOM, the way each surface lays it out:
// the app surfaces as flexbox with a cell of COL × ROW pixels, the terminal
// as a monospace grid of 1ch × 1 line.

export type Node = { type: string; props: Record<string, any>; children: Child[] }
type Child = Node | string | number | null | undefined | false | Child[]

/** The JSX factory the mods compile against. A function as the tag is called with its props and children. */
export const h = (type: string | ((props: any) => Node), props: Record<string, any> | null, ...children: Child[]): Node => {
  const kids = children.flat(Infinity as 1) as Child[]
  if (typeof type === 'function') return type({ ...(props ?? {}), children: kids })
  return { type, props: props ?? {}, children: kids }
}

export type Surface = 'desktop' | 'terminal'

/** A desktop cell in pixels; calibrated against the real pane (see README). */
export const CELL = { col: 7.8, row: 19 }

const THEME: Record<string, string> = {
  success: '#30a46c',
  error: '#e5484d',
  warning: '#d9822b',
  suggestion: '#3e63dd',
  merged: '#8e4ec6',
  diffAdded: '#30a46c',
  diffRemoved: '#e5484d',
  inactive: '#8e8e93',
  subtle: '#8e8e93',
}

const VERTICAL = new Set(['top', 'bottom', 'height', 'minHeight', 'marginTop', 'marginBottom', 'marginY', 'paddingTop', 'paddingBottom', 'paddingY', 'rowGap'])

const unit = (surface: Surface, key: string, v: unknown) => {
  if (typeof v !== 'number') return String(v)
  if (surface === 'terminal') return VERTICAL.has(key) ? `${v * 1.25}em` : `${v}ch`
  return `${v * (VERTICAL.has(key) ? CELL.row : CELL.col)}px`
}

const kebab = (k: string) => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

const boxStyle = (surface: Surface, p: Record<string, any>) => {
  const s: Record<string, string> = { display: p.display === 'none' ? 'none' : 'flex', flexDirection: p.flexDirection ?? 'column', minWidth: '0' }
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || k === 'key' || k === 'hover' || k === 'display') continue
    if (k === 'marginX' || k === 'paddingX') {
      const base = k.startsWith('margin') ? 'margin' : 'padding'
      s[`${base}Left`] = s[`${base}Right`] = unit(surface, base, v)
    } else if (k === 'marginY' || k === 'paddingY') {
      const base = k.startsWith('margin') ? 'margin' : 'padding'
      s[`${base}Top`] = s[`${base}Bottom`] = unit(surface, k, v)
    } else if (k === 'backgroundColor') s.background = THEME[v] ?? v
    else if (k === 'borderStyle') {
      // The desktop draws these; `dashed` it ignores.
      if (v === 'dashed') continue
      const width = v === 'bold' ? 2 : v === 'double' ? 3 : 1
      s.border = `${width}px ${v === 'double' ? 'double' : 'solid'} ${THEME[p.borderColor] ?? p.borderColor ?? 'currentColor'}`
      if (v === 'round') s.borderRadius = surface === 'terminal' ? '0.4em' : '8px'
    }
    else if (k === 'borderColor') continue
    else if (/^(flexGrow|flexShrink)$/.test(k)) s[k] = String(v)
    else if (/^(flexDirection|flexWrap|alignItems|alignSelf|justifyContent|overflow|position)$/.test(k)) s[k] = String(v)
    else s[k] = unit(surface, k, v)
  }
  return s
}

const textStyle = (p: Record<string, any>) => {
  const s: Record<string, string> = {}
  if (p.color) s.color = THEME[p.color] ?? p.color
  if (p.backgroundColor) s.background = THEME[p.backgroundColor] ?? p.backgroundColor
  if (p.dimColor) s.opacity = '0.6'
  if (p.bold) s.fontWeight = '600'
  if (p.italic) s.fontStyle = 'italic'
  if (p.underline) s.textDecoration = 'underline'
  if (p.strikethrough) s.textDecoration = 'line-through'
  if (typeof p.wrap === 'string' && p.wrap.startsWith('truncate')) Object.assign(s, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0' })
  if (p.wrap === 'truncate-start') s.direction = 'rtl'
  return s
}

const apply = (el: HTMLElement, style: Record<string, string>) => {
  for (const [k, v] of Object.entries(style)) el.style.setProperty(kebab(k), v)
  return el
}

/** Draws `node` for `surface`; `press` runs a Button's onPress. */
export const draw = (node: Child, surface: Surface, press: (fn: () => void) => void): globalThis.Node | null => {
  if (node === null || node === undefined || node === false) return null
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node))
  if (Array.isArray(node)) {
    const frag = document.createDocumentFragment()
    for (const c of node) {
      const d = draw(c, surface, press)
      if (d) frag.append(d)
    }
    return frag
  }
  const kids = () => node.children.map(c => draw(c, surface, press)).filter((d): d is globalThis.Node => d !== null)
  const p = node.props
  switch (node.type) {
    case 'Box':
      return withKids(apply(document.createElement('div'), boxStyle(surface, p)), kids())
    case 'Text':
      return withKids(apply(document.createElement('span'), { display: 'block', ...textStyle(p) }), kids(), true)
    case 'Link': {
      const a = document.createElement('a')
      a.href = p.href
      a.target = '_blank'
      a.textContent = p.label ?? p.href
      a.className = 'link'
      return a
    }
    case 'Button': {
      const b = document.createElement('button')
      b.className = p.plain ? 'button plain' : 'button'
      b.textContent = surface === 'terminal' && !p.plain ? `[ ${p.label} ]` : p.label
      if (p.dimColor) b.style.opacity = '0.6'
      b.onclick = () => press(() => p.onPress?.({ surface }))
      return b
    }
    case 'Svg': {
      // As the desktop draws it: an image at the given pixel size.
      const img = document.createElement('img')
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.source ?? '')}`
      img.alt = p.alt ?? ''
      if (p.width !== undefined) img.width = p.width
      if (p.height !== undefined) img.height = p.height
      img.style.display = 'block'
      img.style.flexShrink = '0'
      return img
    }
    case 'Code':
    case 'Markdown': {
      const pre = document.createElement('pre')
      pre.textContent = p.source ?? p.text ?? ''
      return pre
    }
    default:
      return withKids(document.createElement('div'), kids())
  }
}

/** Inline spans inside a Text, block for the outer one. */
const withKids = (el: HTMLElement, kids: globalThis.Node[], text = false) => {
  for (const k of kids) {
    if (text && k instanceof HTMLElement && k.tagName === 'SPAN') k.style.display = 'inline'
    el.append(k)
  }
  return el
}
