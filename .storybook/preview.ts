import type { Decorator, Preview } from '@storybook/html'

import { h } from '../playground/render'

// The kit and the mods compile against a global `h`, as in the engine.
;(globalThis as any).h = h

/**
 * Draws every story inside a pane of the chosen surface, theme and width; with
 * Frame set to "sidebar", inside a copy of the desktop app's side pane (its title
 * bar, expand and close marks, the divider beside the transcript), from a capture.
 */
const pane: Decorator = (story, ctx) => {
  const surface = ctx.globals.surface as string
  const theme = surface === 'terminal' ? 'terminal' : (ctx.globals.theme as string)
  const columns = Number(ctx.globals.columns)
  const drawn = story()
  const content = typeof drawn === 'string' ? Object.assign(document.createElement('div'), { innerHTML: drawn }) : drawn
  const width = surface === 'terminal' ? `${columns}ch` : `${columns * 7.8}px`

  if (ctx.globals.frame === 'sidebar' && surface !== 'terminal') {
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
  body { margin: 0; font: 13px/19px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  .pane { display: inline-block; border-radius: 10px; padding: 12px; }
  .pane.light { background: #fbfbfa; color: #1d1d1f; color-scheme: light; }
  .pane.dark { background: #1f1f1e; color: #ececec; color-scheme: dark; }
  .pane.terminal { background: #101014; color: #d8d8d8; font: 13px/1.25 'SF Mono', Menlo, monospace; }
  .link { color: #6e8efb; }
  /* The desktop app's side pane, from a capture of it (dark), and its light counterpart. */
  .app { display: flex; height: 640px; border-radius: 10px; overflow: hidden; font-size: 12.5px; }
  .app.dark { background: #1c1c1c; color: #e8e8e6; color-scheme: dark; --muted: #8f8f8c; --line: #2c2c2b; --mark: #2e5bd8; }
  .app.light { background: #faf9f5; color: #1f1e1d; color-scheme: light; --muted: #8a8780; --line: #e6e3da; --mark: #2e5bd8; }
  .app .transcript { width: 220px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .app .bubble-msg { height: 34px; border-radius: 8px; background: var(--line); opacity: 0.6; }
  .app .bubble-msg.short { width: 60%; align-self: flex-end; }
  .app .side { display: flex; flex-direction: column; border-left: 1px solid var(--line); }
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
      toolbar: { title: 'Width', icon: 'expand', items: ['28', '36', '46', '60', '80', '110'], dynamicTitle: true },
    },
  },
  initialGlobals: { surface: 'desktop', theme: 'dark', columns: '100', frame: 'sidebar' },
  parameters: { layout: 'padded', controls: { expanded: true } },
}

export default preview
