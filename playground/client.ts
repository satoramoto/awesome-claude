// Runs the `Client` element outside the engine: a surface module (a plugin's
// `(props, surface) => tree`) drawn in its own region, with the ClientSurface
// the engine hands it: elements, local state, the region's size in cells, a
// clock, pointer and keys, and `post` to the hooks module (`ui.message`).

import { CELL, TERMINAL_ROW_EM, drawInClient, unit } from './render'
import type { Child, Node, Surface } from './render'

/** A surface module's component: from props and surface to the tree drawn. */
export type ClientModuleFn = (props: unknown, surface: ClientSurface) => Child

/** What a module file exports: a default component, or one PascalCase export. */
type ModuleLike = Record<string, unknown>

/** Finds the module a `Client` names: `module` as written, relative to `from` (the hooks file that drew it). */
export type ClientResolver = (module: string, from: string | undefined) => Promise<{ fn: ClientModuleFn; path: string } | undefined>

/** What the engine hands a `ui.message` hook (UiMessageArgument). */
export type ClientMessage = { surface: Surface; component: string; requestId: string; element: string; module: string; data: unknown }

/** Stands in for the plugin's `ui.message` hooks: an answer `{ props }` hands the instance its next props. */
export type ClientPost = (message: ClientMessage) => unknown

export type ClientOptions = {
  /** The hooks file that drew the tree, repo-relative (`mods/lab/hooks/register.tsx`); `module` resolves against it. */
  from?: string
  /** Where modules are found; default every file under `mods/<mod>/hooks/`. */
  resolve?: ClientResolver
  /** Where posts go; default the one `configureClients` set, else the console. */
  post?: ClientPost
  /** Names the drawing, so two drawings of one key (two panes side by side) are two instances. */
  site?: string
  /** The render component and request the Client was drawn in, as `ui.message` reports them. */
  component?: string
  requestId?: string
}

export type ClientPointerEvent = {
  type: 'down' | 'move' | 'up' | 'enter' | 'leave'
  x: number
  y: number
  fine?: { x: number; y: number }
  button?: 'left' | 'middle' | 'right'
  shift?: true
  alt?: true
  ctrl?: true
}

export type ClientKeyEvent = { key: string; ctrl?: true; shift?: true; meta?: true }

export type ClientSurface = {
  readonly elements: Record<string, (props: Record<string, any>) => Node>
  readonly state: unknown
  setState: (next: unknown) => void
  readonly columns: number
  readonly rows: number
  every: (ms: number, fn: () => void) => () => void
  onPointer: (fn: (e: ClientPointerEvent) => void) => () => void
  onKey: (fn: (e: ClientKeyEvent) => void) => () => void
  post: (data: unknown) => void
}

// ---- resolving modules ----

/** A path with `.` and `..` folded and any leading `./` or `../` dropped: `mods/lab/hooks/x.tsx`. */
const normal = (path: string) => {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length) out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

const dirname = (path: string) => path.split('/').slice(0, -1).join('/')

/** The component a module exports: its default, else its one PascalCase function. */
const componentOf = (mod: ModuleLike): ClientModuleFn | undefined => {
  if (typeof mod.default === 'function') return mod.default as ClientModuleFn
  const named = Object.entries(mod).filter(([k, v]) => /^[A-Z]/.test(k) && typeof v === 'function')
  return named.length === 1 ? (named[0]![1] as ClientModuleFn) : undefined
}

/**
 * A resolver over a map of modules: path → module, or path → loader
 * (`() => import(...)`, as `import.meta.glob` gives). Paths may start with
 * `../` or `./`; `module` is looked up relative to `from`, then by its own
 * path, then as the end of any path in the map (within `from`'s mod, if given).
 */
export const resolverFrom = (map: Record<string, ModuleLike | (() => Promise<unknown>)>): ClientResolver => {
  const entries = Object.entries(map).map(([path, m]) => ({ path: normal(path), raw: path, m }))
  return async (module, from) => {
    const want = normal(module)
    const exts = /\.(tsx|ts|jsx|js|mjs)$/.test(want) ? [''] : ['', '.tsx', '.ts', '.jsx', '.js', '.mjs']
    const candidates = [...(from ? exts.map(e => normal(`${dirname(normal(from))}/${module}`) + e) : []), ...exts.map(e => want + e)]
    const plugin = from ? normal(from).match(/^(mods\/[^/]+)\//)?.[1] : undefined
    const hit =
      entries.find(e => e.raw === module) ??
      candidates.map(c => entries.find(e => e.path === c)).find(Boolean) ??
      entries.find(e => (!plugin || e.path.startsWith(`${plugin}/`)) && exts.some(x => e.path.endsWith(`/${want}${x}`)))
    if (!hit) return undefined
    const mod = (typeof hit.m === 'function' ? await (hit.m as () => Promise<unknown>)() : hit.m) as ModuleLike
    const fn = componentOf(mod)
    return fn ? { fn, path: hit.path } : undefined
  }
}

/** Every module under a mod's hooks folder, loaded on demand. */
export const modsResolver: ClientResolver = resolverFrom(import.meta.glob('../mods/*/hooks/**/*.{tsx,ts,jsx,js,mjs}'))

const defaults: ClientOptions = {}

/** Sets what every drawing's `Client` uses unless its own options say otherwise: a resolver, a post handler, `from`. */
export const configureClients = (options: ClientOptions) => Object.assign(defaults, options)

// ---- instances ----

const ELEMENTS = ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown']

/** The ClientElements table: constructors taking props with `children`. */
const elements = Object.freeze(
  Object.fromEntries(
    ELEMENTS.map(type => [
      type,
      (props: Record<string, any> = {}): Node => {
        const { children, ...rest } = props
        return { type, props: rest, children: children === undefined ? [] : ([children] as Child[]).flat(Infinity as 1) }
      },
    ]),
  ),
)

const KEYS: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'return',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Home: 'home',
  End: 'end',
  Insert: 'insert',
}

const BUTTONS = ['left', 'middle', 'right'] as const

type Instance = {
  id: string
  key: string
  module: string
  path: string
  surface: Surface
  opts: ClientOptions
  props: unknown
  propsJson: string
  region: HTMLElement
  fn?: ClientModuleFn
  state: unknown
  columns: number
  rows: number
  timers: Set<ReturnType<typeof setInterval>>
  pointer: ((e: ClientPointerEvent) => void) | null
  key_: ((e: ClientKeyEvent) => void) | null
  scheduled: boolean
  /** Something other than a render happened since the last render: a key, pointer, tick, press, props or resize. */
  event: boolean
  /** setState was called during the render in progress. */
  setInRender: boolean
  rendering: boolean
  loops: number
  pending: { data: unknown } | null
  dead: boolean
  /** Sweeps in a row that found the region off the page. */
  strikes: number
  last: { x: number; y: number }
}

const instances = new Map<string, Instance>()

const json = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? 'undefined'
  } catch {
    return '<unserializable>'
  }
}

/** The region's cell in pixels: the desktop's calibrated cell, or the terminal font's 1ch × 1 line. */
const cellOf = (inst: Instance) => {
  if (inst.surface !== 'terminal') return { col: CELL.col, row: CELL.row }
  const probe = document.createElement('span')
  probe.textContent = '0'.repeat(10)
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  inst.region.append(probe)
  const col = probe.getBoundingClientRect().width / 10 || CELL.col
  probe.remove()
  const row = parseFloat(getComputedStyle(inst.region).fontSize || '13') * TERMINAL_ROW_EM
  return { col, row }
}

const stop = (inst: Instance) => {
  for (const t of inst.timers) clearInterval(t)
  inst.timers.clear()
  inst.pointer = null
  inst.key_ = null
  inst.pending = null
  observer.unobserve(inst.region)
}

/** The engine unmounts an instance that throws, overruns or loops; here it says why, dim, in its place. */
const unmount = (inst: Instance, reason: string) => {
  if (inst.dead) return
  inst.dead = true
  stop(inst)
  console.warn(`[Client ${inst.key}] unmounted: ${reason}`)
  const note = document.createElement('span')
  note.className = 'r-unmounted'
  note.textContent = `${inst.module} unmounted: ${reason}`
  note.title = reason
  inst.region.replaceChildren(note)
}

const render = (inst: Instance) => {
  if (inst.dead || !inst.fn) return
  inst.setInRender = false
  inst.rendering = true
  let tree: Child
  const started = performance.now()
  try {
    tree = inst.fn(inst.props, surfaceOf(inst))
  } catch (err) {
    inst.rendering = false
    unmount(inst, `threw ${String((err as Error)?.message ?? err)}`)
    return
  } finally {
    inst.rendering = false
  }
  if (performance.now() - started > 1000) return unmount(inst, 'a render overran a second')
  // A setState on each of three renders in a row, nothing between: a render loop.
  inst.loops = inst.setInRender && !inst.event ? inst.loops + 1 : 0
  inst.event = false
  if (inst.loops >= 3) return unmount(inst, 'render loop (setState on three renders in a row)')
  const drawn = drawInClient(tree, inst.surface, fn => act(inst, fn))
  inst.region.replaceChildren(...(drawn ? [drawn] : []))
}

/** Runs something the person or the clock set off, counted as an event between renders. */
const act = (inst: Instance, fn: () => void) => {
  if (inst.dead) return
  inst.event = true
  try {
    fn()
  } catch (err) {
    unmount(inst, `threw ${String((err as Error)?.message ?? err)}`)
  }
}

const schedule = (inst: Instance) => {
  if (inst.scheduled || inst.dead) return
  inst.scheduled = true
  requestAnimationFrame(() => {
    inst.scheduled = false
    render(inst)
  })
}

const deliver = async (inst: Instance) => {
  const pending = inst.pending
  inst.pending = null
  if (!pending || inst.dead) return
  const text = json(pending.data)
  if (text === '<unserializable>' || text.length > 100_000) return console.warn(`[Client ${inst.key}] post not sent: not plain data within 100000 characters`)
  const message: ClientMessage = {
    surface: inst.surface,
    component: inst.opts.component ?? 'Pane',
    requestId: inst.opts.requestId ?? '',
    element: inst.key,
    module: inst.path.replace(/^mods\/[^/]+\//, ''),
    data: JSON.parse(text),
  }
  const post = inst.opts.post ?? defaults.post
  if (!post) return console.info(`[Client ${inst.key}] post`, message.data)
  const answer = (await post(message)) as { props?: unknown } | undefined
  if (answer && typeof answer === 'object' && answer.props !== undefined && !inst.dead) {
    inst.props = answer.props
    inst.propsJson = json(answer.props)
    inst.event = true
    schedule(inst)
  }
}

const surfaceOf = (inst: Instance): ClientSurface => ({
  elements,
  get state() {
    return inst.state
  },
  setState: next => {
    inst.state = next
    if (inst.rendering) inst.setInRender = true
    schedule(inst)
  },
  get columns() {
    return inst.columns
  },
  get rows() {
    return inst.rows
  },
  every: (ms, fn) => {
    const t = setInterval(() => act(inst, fn), Math.max(1, ms))
    inst.timers.add(t)
    return () => {
      clearInterval(t)
      inst.timers.delete(t)
    }
  },
  onPointer: fn => {
    inst.pointer = fn
    return () => {
      if (inst.pointer === fn) inst.pointer = null
    }
  },
  onKey: fn => {
    inst.key_ = fn
    return () => {
      if (inst.key_ === fn) inst.key_ = null
    }
  },
  post: data => {
    // One per frame; a later post in the frame replaces an undelivered one.
    const first = !inst.pending
    inst.pending = { data }
    if (first) requestAnimationFrame(() => void deliver(inst))
  },
})

/** Re-measures each region in cells; a change redraws the instance. */
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const inst = [...instances.values()].find(i => i.region === entry.target)
    if (!inst || inst.dead) continue
    const cell = cellOf(inst)
    const columns = Math.round(entry.contentRect.width / cell.col)
    const rows = Math.round(entry.contentRect.height / cell.row)
    if (columns === inst.columns && rows === inst.rows) continue
    inst.columns = columns
    inst.rows = rows
    inst.event = true
    schedule(inst)
  }
})

// An instance whose region has left the page, two sweeps running, is gone: its timers stop.
let sweeper: ReturnType<typeof setInterval> | undefined
const sweep = () => {
  for (const [id, inst] of instances) {
    if (inst.region.isConnected) {
      inst.strikes = 0
      continue
    }
    if (++inst.strikes < 2) continue
    stop(inst)
    inst.dead = true
    instances.delete(id)
  }
  if (!instances.size) {
    clearInterval(sweeper)
    sweeper = undefined
  }
}

const listen = (inst: Instance) => {
  const r = inst.region
  const at = (e: PointerEvent, type: ClientPointerEvent['type']): ClientPointerEvent => {
    const rect = r.getBoundingClientRect()
    const cell = cellOf(inst)
    const fx = (e.clientX - rect.left) / cell.col
    const fy = (e.clientY - rect.top) / cell.row
    const out: ClientPointerEvent = { type, x: inst.last.x, y: inst.last.y }
    if (type !== 'enter' && type !== 'leave') {
      out.x = inst.last.x = Math.floor(fx)
      out.y = inst.last.y = Math.floor(fy)
      out.fine = { x: fx, y: fy }
    }
    if (type === 'down' || type === 'up') out.button = BUTTONS[e.button] ?? 'left'
    else if (type === 'move' && e.buttons) out.button = e.buttons & 1 ? 'left' : e.buttons & 4 ? 'middle' : 'right'
    if (e.shiftKey) out.shift = true
    if (e.altKey) out.alt = true
    if (e.ctrlKey) out.ctrl = true
    return out
  }
  const send = (e: PointerEvent, type: ClientPointerEvent['type']) => {
    const fn = inst.pointer
    if (fn) act(inst, () => fn(at(e, type)))
  }
  const control = (t: EventTarget | null) => t instanceof Element && t !== r && !!t.closest('button, input, select, a')
  r.addEventListener('pointerdown', e => {
    // A click gives the instance the focus; the held pointer reaches it past its edges.
    if (!control(e.target)) {
      e.preventDefault()
      r.focus({ preventScroll: true })
      r.setPointerCapture(e.pointerId)
    }
    send(e, 'down')
  })
  r.addEventListener('pointermove', e => send(e, 'move'))
  r.addEventListener('pointerup', e => send(e, 'up'))
  r.addEventListener('pointerenter', e => send(e, 'enter'))
  r.addEventListener('pointerleave', e => send(e, 'leave'))
  r.addEventListener('keydown', e => {
    if (e.target !== r && control(e.target)) return
    // Escape never arrives: it returns the focus.
    if (e.key === 'Escape') return r.blur()
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return
    const fn = inst.key_
    if (!fn) return
    e.preventDefault()
    const ev: ClientKeyEvent = { key: KEYS[e.key] ?? (e.key.length === 1 ? e.key : e.key.toLowerCase()) }
    if (e.ctrlKey) ev.ctrl = true
    if (e.shiftKey) ev.shift = true
    if (e.metaKey) ev.meta = true
    act(inst, () => fn(ev))
  })
}

const size = (region: HTMLElement, surface: Surface, p: Record<string, any>) => {
  region.style.width = p.width === undefined ? '' : unit(surface, 'width', p.width)
  region.style.height = p.height === undefined ? '' : unit(surface, 'height', p.height)
  region.style.flexGrow = p.flexGrow === undefined ? '' : String(p.flexGrow)
}

/** A `Client` element's region: the instance under its key, kept across redraws, mounted on first sight. */
export const drawClient = (p: Record<string, any>, surface: Surface, own: ClientOptions): HTMLElement => {
  const opts: ClientOptions = { ...defaults, ...own }
  const key = String(p.key ?? '')
  const module = String(p.module ?? '')
  const id = [opts.site ?? '', opts.from ?? '', surface, module, key].join('|')
  const propsJson = json(p.props)
  let inst = instances.get(id)
  if (inst && !inst.dead) {
    inst.opts = opts
    size(inst.region, surface, p)
    if (propsJson !== inst.propsJson) {
      // New props reach the running instance, its state kept.
      inst.props = p.props === undefined ? undefined : JSON.parse(propsJson)
      inst.propsJson = propsJson
      inst.event = true
      schedule(inst)
    }
    return inst.region
  }
  if (inst) stop(inst)
  const region = document.createElement('div')
  region.className = 'r-client'
  region.tabIndex = 0
  region.dataset.key = key
  size(region, surface, p)
  inst = {
    id,
    key,
    module,
    path: module,
    surface,
    opts,
    props: p.props === undefined ? undefined : JSON.parse(propsJson),
    propsJson,
    region,
    state: undefined,
    columns: 0,
    rows: 0,
    timers: new Set(),
    pointer: null,
    key_: null,
    scheduled: false,
    event: false,
    setInRender: false,
    rendering: false,
    loops: 0,
    pending: null,
    dead: false,
    strikes: 0,
    last: { x: 0, y: 0 },
  }
  instances.set(id, inst)
  listen(inst)
  observer.observe(region)
  sweeper ??= setInterval(sweep, 1000)
  const mounting = inst
  void (opts.resolve ?? modsResolver)(module, opts.from).then(
    found => {
      if (mounting.dead) return
      if (!found) return unmount(mounting, `no module ${module}${opts.from ? ` from ${opts.from}` : ''} with a default or one PascalCase export`)
      mounting.fn = found.fn
      mounting.path = found.path
      render(mounting)
    },
    err => unmount(mounting, `failed to load: ${String(err?.message ?? err)}`),
  )
  return region
}
