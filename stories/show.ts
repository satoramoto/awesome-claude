// The story helpers for Storybook's html framework. zen's bench/show.ts has the
// same `where` and `show` but imports React to mount them in React stories, which
// this Storybook doesn't use, so they're kept here, drawing with zen's bench.
import type { StoryContext } from '@storybook/html'

import { draw } from '@bench/render'
import type { Node, Surface } from '@bench/render'

/** The surface and width the toolbar picked. */
export const where = (ctx: StoryContext) => ({
  surface: (ctx.globals.surface ?? 'desktop') as Surface,
  columns: Number(ctx.globals.columns ?? 46),
})

/** A render tree as DOM, for the toolbar's surface. Buttons redraw the story. */
export const show = (tree: unknown, ctx: StoryContext, redraw?: () => void): HTMLElement => {
  const { surface } = where(ctx)
  const host = document.createElement('div')
  // The story is the drawing's site: its hover groups, hotkeys, typed text and Client instances are its own.
  const d = draw(
    tree as Node,
    surface,
    fn => {
      fn()
      redraw?.()
    },
    { client: { site: ctx.id } },
  )
  if (d) host.append(d)
  return host
}
