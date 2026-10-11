import { load, onChange } from './engine'
import { messages } from './host'
import { CELL, Fragment, draw, h } from './render'
import type { Node, Surface } from './render'

// The mods and their surface modules compile against a global `h` and `Fragment`, as in the engine.
;(globalThis as any).h = h
;(globalThis as any).Fragment = Fragment

type Hook = ($: unknown, e: any, next: (e: any) => Promise<unknown>) => unknown
type Registered = { event: string; matcher: Record<string, unknown>; hook: Hook }

const modules = import.meta.glob('../mods/*/hooks/register.tsx')
const fixtures = import.meta.glob<Record<string, Record<string, unknown>>>('./fixtures/*.ts', { eager: true })
const nameOf = (path: string) => path.split('/').at(-3) ?? path

/** A `$` for render hooks: the ui noun, and every other call a no-op that resolves undefined. */
const engine = (surfaceOf: (e: any) => string): any => {
  const noop: any = new Proxy(() => Promise.resolve(undefined), { get: () => noop, apply: () => Promise.resolve(undefined) })
  return new Proxy(
    {},
    {
      get: (_, noun) =>
        noun === 'ui'
          ? new Proxy(
              {},
              {
                get: (_, verb) =>
                  verb === 'resolve'
                    ? (e: any) => {
                        const surface = surfaceOf(e)
                        const all = ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Svg', 'Client']
                        return Object.fromEntries(all.map(n => [n, n]))
                      }
                    : noop,
              },
            )
          : noop,
    },
  )
}

const registerMod = async (path: string): Promise<Registered[]> => {
  const mod: any = await modules[path]!()
  const hooks: Registered[] = []
  const on = (event: string, matcherOrHook: any, maybeHook?: Hook) => {
    const [matcher, hook] = typeof matcherOrHook === 'function' ? [{}, matcherOrHook] : [matcherOrHook, maybeHook!]
    hooks.push({ event, matcher, hook })
    const handle = { catch: () => handle }
    return handle
  }
  mod.register(on, {})
  return hooks
}

// ---- the page ----

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const state = {
  mod: localStorage.getItem('mod') ?? '',
  scenario: localStorage.getItem('scenario') ?? '',
  columns: Number(localStorage.getItem('columns') ?? 46),
  panes: JSON.parse(localStorage.getItem('panes') ?? '["desktop-light","desktop-dark","terminal"]') as string[],
}
const save = () => {
  localStorage.setItem('mod', state.mod)
  localStorage.setItem('scenario', state.scenario)
  localStorage.setItem('columns', String(state.columns))
  localStorage.setItem('panes', JSON.stringify(state.panes))
}

const mods = Object.keys(modules).map(p => ({ name: nameOf(p), path: p }))
if (!mods.some(m => m.name === state.mod)) state.mod = mods[0]?.name ?? ''

const scenariosOf = (mod: string) => fixtures[`./fixtures/${mod}.ts`] ?? {}

let hooks: Registered[] = []

const PANES: Record<string, { surface: Surface; theme: 'light' | 'dark'; label: string }> = {
  'desktop-light': { surface: 'desktop', theme: 'light', label: 'Desktop · light' },
  'desktop-dark': { surface: 'desktop', theme: 'dark', label: 'Desktop · dark' },
  terminal: { surface: 'terminal', theme: 'dark', label: 'Terminal' },
}

const renderPane = async (key: string): Promise<HTMLElement> => {
  const spec = PANES[key]!
  const card = document.createElement('section')
  card.className = `pane ${spec.surface} ${spec.theme}`
  const width = spec.surface === 'terminal' ? `${state.columns}ch` : `${state.columns * CELL.col}px`
  card.innerHTML = `<header>${spec.label}<span>${state.columns} cols</span></header>`
  const body = document.createElement('div')
  body.className = 'body'
  body.style.width = width
  card.append(body)

  const surface = spec.surface
  const panes = hooks.filter(r => r.event === 'ui.render' && r.matcher.component === 'Pane')
  for (const r of panes) {
    const e = {
      component: 'Pane',
      requestId: r.matcher.requestId,
      surface,
      props: { title: String(r.matcher.requestId), isFocused: false, bodyColumns: state.columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    }
    try {
      const tree = (await r.hook(engine(() => surface), e, async () => h('Text', { dimColor: true }, '(the engine draws its own)'))) as Node
      // Each pane its own site, so a Client drawn in two panes runs twice, as in two windows.
      const mod = mods.find(m => m.name === state.mod)!
      const client = { site: key, from: mod.path.replace(/^\.\.\//, ''), post: messages(hooks), requestId: String(r.matcher.requestId) }
      const drawn = draw(tree, surface, fn => fn(), { client })
      if (drawn) body.append(drawn)
    } catch (err) {
      const pre = document.createElement('pre')
      pre.className = 'error'
      pre.textContent = String((err as Error)?.stack ?? err)
      body.append(pre)
    }
  }
  return card
}

const redraw = async () => {
  const stage = $('#stage')
  const cards = await Promise.all(state.panes.map(renderPane))
  stage.replaceChildren(...cards)
}

const toolbar = () => {
  const modSel = $<HTMLSelectElement>('#mod')
  modSel.replaceChildren(...mods.map(m => new Option(m.name, m.name, false, m.name === state.mod)))
  modSel.onchange = () => {
    state.mod = modSel.value
    state.scenario = ''
    void start()
  }
  const scenarios = Object.keys(scenariosOf(state.mod))
  if (!scenarios.includes(state.scenario)) state.scenario = scenarios[0] ?? ''
  const scenSel = $<HTMLSelectElement>('#scenario')
  scenSel.replaceChildren(...scenarios.map(s => new Option(s, s, false, s === state.scenario)))
  scenSel.onchange = () => {
    state.scenario = scenSel.value
    load(state.mod, scenariosOf(state.mod)[state.scenario] ?? {})
    save()
    void redraw()
  }
  const cols = $<HTMLInputElement>('#columns')
  cols.value = String(state.columns)
  $('#columns-label').textContent = `${state.columns} cols`
  cols.oninput = () => {
    state.columns = Number(cols.value)
    $('#columns-label').textContent = `${state.columns} cols`
    save()
    void redraw()
  }
  for (const box of document.querySelectorAll<HTMLInputElement>('input[name=pane]')) {
    box.checked = state.panes.includes(box.value)
    box.onchange = () => {
      state.panes = [...document.querySelectorAll<HTMLInputElement>('input[name=pane]:checked')].map(b => b.value)
      save()
      void redraw()
    }
  }
}

const start = async () => {
  const mod = mods.find(m => m.name === state.mod)
  if (!mod) {
    $('#stage').textContent = 'No mods in mods/.'
    return
  }
  hooks = await registerMod(mod.path)
  toolbar()
  load(state.mod, scenariosOf(state.mod)[state.scenario] ?? {})
  save()
  await redraw()
}

onChange(() => void redraw())

// The engine's own checks, run by the dev server after each save (vite.config.ts).
if (import.meta.hot) {
  import.meta.hot.on('awesome:check', (msg: { mod: string; ok: boolean; summary: string; output: string }) => {
    const el = $('#check')
    el.className = msg.ok ? 'ok' : 'bad'
    el.textContent = `${msg.ok ? '✓' : '✕'} ${msg.mod}: ${msg.summary}`
    el.title = msg.output
  })
}

void start()
