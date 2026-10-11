import { addons } from '@storybook/preview-api'
import type { Decorator, Preview } from '@storybook/html'

import { CELL, h } from '../playground/render'

// The kit and the mods compile against a global `h`, as in the engine.
;(globalThis as any).h = h

/** The canvas's margin around the frame, each side. */
const GUTTER = 16
/** What a frame adds around its body, left and right together: the side pane's padding and divider, or the plain pane's padding. */
const CHROME = { sidebar: 21, pane: 24 }

// The fitted width depends on the canvas, which settles after the first draw and
// changes as the window resizes; whenever it differs from the one last drawn at,
// the story draws again.
let drawnAt = 0
let redraw: ReturnType<typeof setTimeout> | undefined
new ResizeObserver(() => {
  if (document.documentElement.clientWidth === drawnAt) return
  clearTimeout(redraw)
  redraw = setTimeout(() => addons.getChannel().emit('forceReRender'), 100)
}).observe(document.documentElement)

/**
 * Draws every story inside a pane of the chosen surface, theme and width; with
 * Frame set to "sidebar", inside a copy of the desktop app's side pane (its title
 * bar, expand and close marks, the divider beside the transcript), from a capture.
 *
 * As in the app, the pane never runs past the window: when the chosen width
 * doesn't fit, the pane narrows to the room there is and the story is told the
 * columns that fit, so it lays out at that width rather than spilling over.
 */
const pane: Decorator = (story, ctx) => {
  const surface = ctx.globals.surface as string
  const theme = surface === 'terminal' ? 'terminal' : (ctx.globals.theme as string)
  const sidebar = ctx.globals.frame === 'sidebar' && surface !== 'terminal'
  drawnAt = document.documentElement.clientWidth
  const room = drawnAt - 2 * GUTTER - (sidebar ? CHROME.sidebar : CHROME.pane)
  // A terminal cell (1ch of 13px SF Mono) is as wide as a desktop cell.
  const columns = Math.max(1, Math.min(Number(ctx.globals.columns), Math.floor(room / CELL.col)))
  const drawn = story({ globals: { ...ctx.globals, columns: String(columns) } })
  const content = typeof drawn === 'string' ? Object.assign(document.createElement('div'), { innerHTML: drawn }) : drawn
  const width = surface === 'terminal' ? `${columns}ch` : `${columns * CELL.col}px`

  if (sidebar) {
    const app = document.createElement('div')
    app.className = `app ${theme}`
    app.innerHTML = `<div class="transcript"><div class="bubble-msg"></div><div class="bubble-msg short"></div><div class="bubble-msg"></div></div>`
    const side = document.createElement('div')
    side.className = 'side'
    side.innerHTML = `<div class="side-head"><span>Overview</span><span class="marks"><span class="mark on">⤢</span><span class="mark">✕</span></span></div>`
    const body = document.createElement('div')
    body.className = 'side-body'
    body.style.width = width
    body.append(content)
    side.append(body)
    app.append(side)
    return app
  }

  const frame = document.createElement('div')
  frame.className = `pane ${theme}`
  const body = document.createElement('div')
  body.className = 'body'
  body.style.width = width
  body.append(content)
  frame.append(body)
  return frame
}

const style = document.createElement('style')
style.textContent = `
  /* Room for the scrollbar always, so the width the frame is fitted to doesn't shrink once a tall story draws. */
  html { scrollbar-gutter: stable; }
  body { margin: 0; overflow-x: hidden; font: 13px/19px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  #storybook-root { padding: ${GUTTER}px; }
  .pane { display: inline-block; border-radius: 10px; padding: 12px; }
  .pane.light { background: #fbfbfa; color: #1d1d1f; color-scheme: light; }
  .pane.dark { background: #1f1f1e; color: #ececec; color-scheme: dark; }
  .pane.terminal { background: #101014; color: #d8d8d8; font: 13px/1.25 'SF Mono', Menlo, monospace; }
  .link { color: #6e8efb; }
  /* The desktop app's side pane, from a capture of it (dark), and its light counterpart. */
  .app { display: flex; height: 640px; border-radius: 10px; overflow: hidden; font-size: 12.5px; }
  .app.dark { background: #1c1c1c; color: #e8e8e6; color-scheme: dark; --muted: #8f8f8c; --line: #2c2c2b; --mark: #2e5bd8; }
  .app.light { background: #faf9f5; color: #1f1e1d; color-scheme: light; --muted: #8a8780; --line: #e6e3da; --mark: #2e5bd8; }
  /* The transcript takes what the side pane leaves, down to nothing; its side margins sit on the bubbles so it can. */
  .app .transcript { flex: 1 1 220px; min-width: 0; overflow: hidden; padding: 16px 0; display: flex; flex-direction: column; gap: 12px; }
  .app .bubble-msg { margin: 0 16px; height: 34px; border-radius: 8px; background: var(--line); opacity: 0.6; }
  .app .bubble-msg.short { width: 60%; align-self: flex-end; }
  .app .side { flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--line); }
  .app .side-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; color: var(--muted); }
  .app .marks { display: flex; gap: 10px; }
  .app .mark.on { color: var(--mark); border: 1px solid var(--mark); border-radius: 5px; padding: 0 3px; }
  .app .side-body { padding: 4px 10px 10px; overflow: auto; }
  .button { font: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; }
`
document.head.append(style)

const preview: Preview = {
  decorators: [pane],
  globalTypes: {
    surface: {
      description: 'Where it draws',
      toolbar: { title: 'Surface', icon: 'browser', items: ['desktop', 'terminal'], dynamicTitle: true },
    },
    theme: {
      description: 'Desktop theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
    frame: {
      description: 'Around the story',
      toolbar: { title: 'Frame', icon: 'sidebaralt', items: ['pane', 'sidebar'], dynamicTitle: true },
    },
    columns: {
      description: 'Pane width in cells',
      toolbar: { title: 'Width', icon: 'expand', items: ['28', '36', '46', '60', '80', '100', '110'], dynamicTitle: true },
    },
  },
  initialGlobals: { surface: 'desktop', theme: 'dark', columns: '100', frame: 'sidebar' },
  // The frame sits GUTTER in from the canvas's edges; 'fullscreen' leaves that to us.
  parameters: { layout: 'fullscreen', controls: { expanded: true } },
}

export default preview
