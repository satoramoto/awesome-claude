import type { Meta, StoryObj } from '@storybook/html'

import { short, tokens } from '@kit/format'
import type { PerfRow } from '@kit/perf'
import { C, GLYPH, PALETTE, levelColor } from '@kit/tokens'

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
          { value: args.a, color: C.blue },
          { value: args.b, color: C.purple },
          { value: args.c, color: C.bad },
        ],
        args.max,
        { height: args.height },
      ),
      ctx,
    ),
}

export const LegendBar: Story = {
  args: { system: 3_100, tools: 14_200, mcp: 6_400, memory: 2_300, skills: 3_900, messages: 31_100, max: 200_000 },
  render: (args, ctx) =>
    show(
      kitFor(ctx).legendBar(
        [
          { value: args.system, color: PALETTE[0]!, label: 'sys' },
          { value: args.tools, color: PALETTE[1]!, label: 'tls' },
          { value: args.mcp, color: PALETTE[2]!, label: 'mcp' },
          { value: args.memory, color: PALETTE[3]!, label: 'mem' },
          { value: args.skills, color: PALETTE[4]!, label: 'skl' },
          { value: args.messages, color: PALETTE[5]!, label: 'msg' },
        ],
        args.max,
        tokens,
      ),
      ctx,
    ),
}

export const LabelBar: Story = {
  args: { fiveHour: 42, weekly: 78, opus: 96 },
  argTypes: Object.fromEntries(['fiveHour', 'weekly', 'opus'].map(k => [k, { control: { type: 'range', min: 0, max: 110 } }])),
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const row = (key: string, label: string, v: number) =>
      k.labelBar(key, label, [{ value: Math.min(100, v), color: levelColor(v) }], 100, h('Text', { bold: true, color: levelColor(v) }, `${v}%`))
    return show(h('Box', { flexDirection: 'column' }, row('5h', '5-hour', args.fiveHour), row('7d', 'Weekly', args.weekly), row('op', 'Weekly opus', args.opus)), ctx)
  },
}

export const Section: Story = {
  args: { title: 'Tools', right: '103', collapsible: true, collapsed: false },
  render: (args, ctx) => {
    let collapsed = args.collapsed as boolean
    const host = document.createElement('div')
    const paint = () => {
      const k = kitFor(ctx)
      const tree = k.section({
        id: 'demo',
        icon: GLYPH.tools,
        color: C.purple,
        title: args.title,
        right: h('Text', { dimColor: true }, args.right),
        collapsed,
        ...(args.collapsible ? { onToggle: () => (collapsed = !collapsed) } : {}),
        children: [
          k.labelBar('bash', 'Bash', [{ value: 41, color: C.blue }], 41, h('Text', { bold: true }, '41')),
          k.labelBar('read', 'Read', [{ value: 33, color: C.purple }], 41, h('Text', { bold: true }, '33')),
        ],
      })
      host.replaceChildren(show(tree, ctx, paint))
    }
    paint()
    return host
  },
}

export const Grid: Story = {
  args: { sections: 4, minWidth: 34 },
  argTypes: { sections: { control: { type: 'range', min: 1, max: 6 } }, minWidth: { control: { type: 'range', min: 16, max: 60 } } },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    const names = ['Context', 'Turns', 'Tools', 'Agents', 'Limits', 'Git']
    const items = names.slice(0, args.sections).map((title, i) =>
      k.section({
        id: title,
        icon: GLYPH.layers,
        color: PALETTE[i]!,
        title,
        children: k.bar([{ value: 20 + i * 12, color: PALETTE[i]! }], 100),
      }),
    )
    return show(k.grid(items, args.minWidth), ctx)
  },
}

export const Columns: Story = {
  args: { turns: 23, slots: 24 },
  argTypes: { turns: { control: { type: 'range', min: 1, max: 40 } } },
  render: (args, ctx) =>
    show(
      kitFor(ctx).columns(
        Array.from({ length: args.turns }, (_, i) => [
          { value: 600 + ((i * 7) % 5) * 500, color: C.ok },
          { value: 800 + (i % 4) * 300, color: C.cyan },
          { value: i % 6 === 0 ? 9_000 : 1_200, color: C.purple },
          { value: 20_000 + i * 1_800, color: C.blue },
        ]),
        { slots: args.slots },
      ),
      ctx,
    ),
}

export const Stats: Story = {
  args: { percent: 31, cost: '4.82', minutes: 47, turns: 23, tools: 103, failed: 4, files: 7 },
  render: (args, ctx) => {
    const k = kitFor(ctx)
    return show(
      k.flow([
        k.stat(GLYPH.context, levelColor(args.percent), `${args.percent}%`),
        k.stat(GLYPH.cost, C.ok, args.cost),
        k.stat(GLYPH.time, C.cyan, short(args.minutes * 60_000)),
        k.stat(GLYPH.turns, C.blue, String(args.turns)),
        k.stat(GLYPH.tools, args.failed ? C.warn : C.purple, String(args.tools), args.failed ? ` ${args.failed}${GLYPH.failed}` : undefined),
        k.stat(GLYPH.files, C.warn, String(args.files)),
      ]),
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
