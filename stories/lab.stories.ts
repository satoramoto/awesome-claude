import type { Meta, StoryObj } from '@storybook/html'

import { collect, engine } from '@bench/host'
import type { Node } from '@bench/render'

import * as mod from '../mods/lab/hooks/register'
import { show, where } from './show'

// The lab mod's own panes, from its render hooks: the index (`/lab`) and the
// gallery (`/lab gallery`). The experiments one by one are under Engine.
const hooks = collect(mod as any)

const meta: Meta = { title: 'Mods/Lab' }
export default meta

/** Draws the lab pane `requestId` through whichever of the mod's Pane hooks matches it. */
const pane = (requestId: string): StoryObj => ({
  render: (_, ctx) => {
    const host = document.createElement('div')
    const paint = async () => {
      const { surface, columns } = where(ctx)
      const r = hooks.find(h => {
        const m = h.matcher.requestId
        return h.event === 'ui.render' && h.matcher.component === 'Pane' && (m instanceof RegExp ? m.test(requestId) : m === requestId)
      })!
      const e = {
        component: 'Pane',
        requestId,
        surface,
        props: { title: 'Lab', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
      }
      const tree = (await r.hook(engine, e, async () => null)) as Node
      host.replaceChildren(show(tree, ctx, () => void paint()))
    }
    void paint()
    return host
  },
})

export const Index = pane('lab')
export const Gallery = pane('lab-gallery')
/** The index and the gallery in a desktop pane expanded to about 1400px: the groups, and the experiments, in three columns. */
export const IndexWide1400: StoryObj = { ...pane('lab'), globals: { surface: 'desktop', frame: 'pane', columns: '180' } }
export const GalleryWide1400: StoryObj = { ...pane('lab-gallery'), globals: { surface: 'desktop', frame: 'pane', columns: '180' } }
