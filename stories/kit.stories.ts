import type { Meta, StoryObj } from '@storybook/html'

import { tokens } from '@kit/format'
import type { PerfRow } from '@kit/perf'
import { C, GLYPH, INK, RAMP, levelColor } from '@kit/tokens'

import { h } from '../playground/render'
import { kitFor, show } from './show'

type Args = Record<string, any>

const meta: Meta<Args> = { title: 'Kit' }
export default meta

type Story = StoryObj<Args>

export const Bar: Story = {
  args: { a: 30, b: 15, c: 8, max: 100, height: 0.45 },
  argTypes: { height: { control: { type: 'range', min: 0.2, max: 1.5, step: 0.05 } } },
  render: (args, ctx) =>
    show(
      kitFor(ctx).bar(
        [
          { value: args.a, color: RAMP.slate[0] },
          { value: args.b, color: RAMP.slate[1] },
          { value: args.c, color: C.blue },
        ],
        args.max,
        { height: args.height },
      ),
      ctx,
    ),
}

/** A section with readings: label, gauge, figure, unit, in the kit's fixed columns. */
export const Section: Story = {
  args: { title: 'Limits', collapsible: true, collapsed: false, fiveHour: 42, weekly: 81 },
  render: (args, ctx) => {
    let collapsed = args.collapsed as boolean
    const host = document.createElement('div')
    const paint = () => {
      const k = kitFor(ctx)
      const tree = k.section({
        id: 'demo',
        icon: GLYPH.limits,
        title: args.title,
        right: k.summary([['2', 'windows']]),
        collapsed,
        ...(args.collapsible ? { onToggle: () => (collapsed = !collapsed) } : {}),
        children: [
          k.reading('5h', { label: '5-hour', value: args.fiveHour, max: 100, color: levelColor(args.fiveHour), figure: `${args.fiveHour}%`, unit: '2h18' }),
          k.reading('wk', { label: 'Weekly', value: args.weekly, max: 100, color: levelColor(args.weekly), figure: `${args.weekly}%`, unit: '3d4h' }),
        ],
      })
      host.replaceChildren(show(tree, ctx, paint))
    }
    paint()
    return host
  },
}

/** The two ways to round on the desktop; see the notes above `cap` in kit/ui.tsx. */
export const Rounding: Story = {
  args: { fill: '#272727', height: 0.45 },
  argTypes: { fill: { control: 'color' }, height: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } } },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const flat = (color: string) => (rows: number | undefined) => h('Box', { flexGrow: 1, height: rows, backgroundColor: color })
    return show(
      h(
        'Box',
        { flexDirection: 'column', rowGap: 0.8 },
        k.rounded(args.fill, { paddingX: 1, paddingY: 0.2 }, h('Text', { bold: true }, 'rounded: a solid fill, a row or more tall')),
        k.capped(args.height, INK, INK, flat(INK)),
        k.bar([{ value: 45, color: INK }, { value: 15, color: C.blue }], 100, { height: args.height }),
      ),
      ctx,
    )
  },
}

/** A legend in two columns, and a header summary. */
export const Legend: Story = {
  render: (_, ctx) => {
    const k = kitFor(ctx)
    return show(
      h(
        'Box',
        { flexDirection: 'column', rowGap: 1 },
        k.summary([['28%', 'of 1M'], ['3', 'failed', C.bad]]),
        k.legend('demo', [
          { label: 'System', color: RAMP.slate[0], figure: tokens(5_300) },
          { label: 'Tools', color: RAMP.slate[1], figure: tokens(29_700) },
          { label: 'MCP', color: RAMP.slate[2], figure: tokens(20_500) },
          { label: 'Memory', color: RAMP.slate[3], figure: tokens(9_500) },
          { label: 'Messages', color: C.blue, figure: tokens(207_000) },
        ]),
      ),
      ctx,
    )
  },
}

/** Stacked columns on a baseline, with labels under their columns. */
export const Columns: Story = {
  args: { turns: 11, slots: 16 },
  argTypes: { turns: { control: { type: 'range', min: 1, max: 16 } } },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const n = args.turns as number
    const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, xs) => xs.indexOf(v) === i)
    return show(
      h(
        'Box',
        { flexDirection: 'column' },
        k.columns(
          Array.from({ length: n }, (_, i) => [
            { value: 1 + (i % 3), color: RAMP.slate[1] },
            { value: 2 + ((i * 5) % 7), color: RAMP.blue[1] },
            { value: 3 + ((i * 3) % 9), color: RAMP.blue[0] },
          ]),
          { slots: args.slots, height: 3.5 },
        ),
        k.axis(
          'demo',
          ticks.map(i => ({ at: (i + 0.5) / args.slots, text: String(i + 1).padStart(2, '0') })),
        ),
      ),
      ctx,
    )
  },
}

const row = (name: string, avgMs: number, perMin: number): PerfRow => ({
  name,
  n: perMin * 12,
  perMin,
  avgMs,
  lastMs: avgMs,
  maxMs: avgMs * 2,
  busyMs: avgMs * perMin,
})

export const PerfFooter: Story = {
  args: { gitMs: 38, gitPerMin: 4, renderMs: 2.1, rendersPerMin: 9, ghMs: 900, ghPerMin: 3 },
  render: (args, ctx) => {
    const rows = [
      row('git', args.gitMs, args.gitPerMin),
      row('render', args.renderMs, args.rendersPerMin),
      row('gh', args.ghMs, args.ghPerMin),
      row('tool.call', 0.3, 40),
    ].sort((a, b) => b.busyMs - a.busyMs)
    return show(kitFor(ctx).perf({ sinceMs: 12 * 60_000, rows }), ctx)
  },
}
