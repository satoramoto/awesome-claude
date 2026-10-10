import type { SessionContextBreakdown } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

/** `/overview`, as the person runs it: reads everything at once and opens the pane. */
const openPane = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  await $.command.run({ command: 'overview', args: '', origin: { kind: 'composer' } } as never)
}

const breakdown: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 14_000, color: 'claude', isDeferred: false, kind: 'used' },
    { name: 'Skills', tokens: 0, color: 'warning', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 150_000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 17_000,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'auto',
  percentage: 9,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [{ path: '/Users/me/.claude/CLAUDE.md', type: 'User', tokens: 900 }],
  mcpTools: [],
  agents: [],
  isAutoCompactEnabled: true,
  autoCompactThreshold: 167_000,
  apiUsage: null,
}

describe('pane', () => {
  test('after a measurement, draws the percent, a row per non-empty category and the details', async ($, on) => {
    const context = { tokens: 17_000, window: 200_000, percent: 9 }
    on('session.usage', () => ({ value: { startedAt: 0, context: { ...context, breakdown }, rateLimits: [] } }))
    await openPane($, on)

    const ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: '9%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Messages' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Skills' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /CLAUDE\.md \(User\) 900/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Auto-compacts at 167k' })).toBeDefined()
    await ui.unmount()
  })

  test('on the desktop, draws readings in bubbles: summary, context, limits', async ($, on) => {
    const context = { tokens: 17_000, window: 200_000, percent: 9 }
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { ...context, breakdown },
        rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
        cost: { usd: 1.5 },
      },
    }))
    await openPane($, on)

    const ui = await mount($, 'desktop')
    expect(await ui.find({ type: 'Text', text: /^\$1\.50/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '9%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '14k msg' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /skl/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Compacts at' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '167k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '5-hour' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
    // Plain words, no game vocabulary.
    expect(await ui.find({ type: 'Text', text: /\b(HP|MP|LV|party)\b/i })).toBeUndefined()
    // Boxes and text only: crisp at any width.
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()

    // Folding a section leaves its heading and hides the rest; unfolding brings it back.
    await ui.press({ key: 'toggle-context' })
    expect(await ui.find({ type: 'Text', text: '14k msg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Context' })).toBeDefined()
    await ui.press({ key: 'toggle-context' })
    expect(await ui.find({ type: 'Text', text: '14k msg' })).toBeDefined()
    await ui.unmount()
  })
})

const mount = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'overview',
    surface,
    component: 'Pane',
    requestId: 'overview',
    props: {
      title: 'Context',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
