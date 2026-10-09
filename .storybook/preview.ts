import type { Decorator, Preview } from '@storybook/html'

import { h } from '../playground/render'

// The kit and the mods compile against a global `h`, as in the engine.
;(globalThis as any).h = h

/** Draws every story inside a pane of the chosen surface, theme and width. */
const pane: Decorator = (story, ctx) => {
  const surface = ctx.globals.surface as string
  const theme = surface === 'terminal' ? 'terminal' : (ctx.globals.theme as string)
  const columns = Number(ctx.globals.columns)
  const frame = document.createElement('div')
  frame.className = `pane ${theme}`
  const body = document.createElement('div')
  body.className = 'body'
  body.style.width = surface === 'terminal' ? `${columns}ch` : `${columns * 7.8}px`
  const drawn = story()
  body.append(typeof drawn === 'string' ? Object.assign(document.createElement('div'), { innerHTML: drawn }) : drawn)
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
    columns: {
      description: 'Pane width in cells',
      toolbar: { title: 'Width', icon: 'expand', items: ['28', '36', '46', '60', '80', '110'], dynamicTitle: true },
    },
  },
  initialGlobals: { surface: 'desktop', theme: 'light', columns: '46' },
  parameters: { layout: 'padded', controls: { expanded: true } },
}

export default preview
