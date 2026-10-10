import type { StoryContext } from '@storybook/html'

import { kit } from '@kit/ui'

import { draw } from '../playground/render'
import type { Node, Surface } from '../playground/render'

/** The surface and width the toolbar picked. */
export const where = (ctx: StoryContext) => ({
  surface: (ctx.globals.surface ?? 'desktop') as Surface,
  columns: Number(ctx.globals.columns ?? 46),
})

/** The kit for the toolbar's surface and width. */
export const kitFor = (ctx: StoryContext) => {
  const { surface, columns } = where(ctx)
  // The app surfaces draw Svg (rounded ends); the terminal doesn't.
  const Svg = surface === 'terminal' ? undefined : ('Svg' as any)
  return kit({ Box: 'Box' as any, Text: 'Text' as any, Button: 'Button' as any, Svg }, surface, columns)
}

/** A render tree as DOM, for the toolbar's surface. Buttons redraw the story. */
export const show = (tree: unknown, ctx: StoryContext, redraw?: () => void): HTMLElement => {
  const { surface } = where(ctx)
  const host = document.createElement('div')
  const d = draw(tree as Node, surface, fn => {
    fn()
    redraw?.()
  })
  if (d) host.append(d)
  return host
}
