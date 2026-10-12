// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Modified in the awesome-claude fork (2026): this file is new. Render and
// behaviour tests of the fork's Blast Radius through the engine's test kit.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

// A risky Bash call is held by the mod's tool.call hook. Beneath it, the test
// stands for the engine: `process.run` answers the measuring script with a
// build folder of 13 files, and the hold's `sleep` on the test's clock;
// `ui.open` places the pane or not, and the Bash tool itself answers "ran".
// While the hook holds, the mod's other hooks run between its waits, so the
// test moves the clock on until what it started (a mount, a press) is done.
const RM_OUT = ['13 49152 1', 'build/index.html', 'build/assets/index.js'].join('\n')

const run = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

const PANE = {
  component: 'Pane',
  requestId: 'blast-radius',
  props: { title: 'Blast Radius', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

/** The engine beneath the mod, with a clock that moves only when the test moves it. */
const engine = (on: On, placed = true, measured = RM_OUT): MockClock => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
  on('session.cwd', async () => ({ value: '/repo' }))
  on('ui.open', async () => ({ value: placed ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'the terminal is too narrow' } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('process.run', async (_$, e) => {
    // The hold's wait, on the test's clock.
    if (e.argv[0] === 'sleep') {
      await clock.sleep(Number(e.argv[1]) * 1000)
      return run('')
    }
    return e.argv[0] === 'bash' ? run(measured) : run('', 1)
  })
  // The Bash tool itself, reached only when the mod lets the call through.
  on('tool.call', async () => ({ result: { stdout: '', stderr: '' }, text: 'ran' }) as any)
  return clock
}

/** Moves the clock a hold's wait at a time until `work` is done (at most a minute of the hold). */
const drive = async <T,>(clock: MockClock, work: Promise<T>): Promise<T> => {
  let done = false
  const settled = work.finally(() => (done = true))
  for (let i = 0; i < 240 && !done; i++) await clock.advance(250)
  return settled
}

/** Holds `rm -rf build`, then draws the component once the mod measured it and opened its pane. */
const hold = async ($: Engine, clock: MockClock, surface: 'terminal' | 'desktop', where: { component: string; props: object } = PANE) => {
  const call = $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as any) as Promise<any>
  await clock.settle()
  const ui = await drive(clock, $.ui.mount({ plugin: 'blast-radius', surface, ...where } as any))
  return { call, ui: ui as any }
}

const CANCELLED = 'the user pressed Cancel'

test('the terminal draws the report with the kit inside the warning border, and Cancel refuses the command', async ($, on) => {
  const clock = engine(on)
  const { call, ui } = await hold($, clock, 'terminal')
  // The one round border, in the warning colour's theme key.
  const tree = (await ui.drawn()) as any
  expect(tree.props).toMatchObject({ borderStyle: 'round', borderColor: 'warning' })
  // The head: the alert glyph and what's held; no ⚠ title line (that's the pane's title).
  expect(await ui.find({ type: 'Text', text: '▲' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'rm -rf' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Blast Radius|⚠/ })).toBeUndefined()
  // Command and Would as property rows: a plain label, then the bold value; what it would delete in the failed colour.
  expect((await ui.find({ type: 'Text', text: 'Command' }))?.props.dimColor).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'rm -rf build' }))?.props).toMatchObject({ bold: true })
  expect((await ui.find({ type: 'Text', text: 'Would' }))?.props.dimColor).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'delete 13 files (about 48 KB)' }))?.props).toMatchObject({ color: 'error', wrap: 'truncate' })
  // The list as items: the file glyph, then the path, cut at the edge.
  expect(await ui.findAll({ type: 'Text', text: '□' })).toHaveLength(2)
  expect((await ui.find({ type: 'Text', text: 'build/assets/index.js' }))?.props).toMatchObject({ wrap: 'truncate' })
  expect(await ui.find({ type: 'Text', text: '+ 11 more' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Paths: build' })).toBeDefined()
  // At 60 columns the hint fits beside the actions; they carry hotkeys 1 and 2.
  expect(await ui.find({ type: 'Text', text: 'Claude is waiting on your answer' })).toBeDefined()
  const buttons: { key?: string; props: Record<string, unknown> }[] = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => [b.key, b.props.label, b.props.hotkey])).toEqual([
    ['proceed', 'Proceed', '1'],
    ['cancel', 'Cancel', '2'],
  ])
  // Cancel holds the focus, so Enter refuses, as upstream; Proceed doesn't, and it's red (it destroys).
  expect(buttons.find(b => b.key === 'cancel')?.props).toMatchObject({ autoFocus: true })
  expect(buttons.find(b => b.key === 'proceed')?.props.autoFocus).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'Proceed' }))?.props).toMatchObject({ color: 'error' })
  expect((await ui.find({ type: 'Text', text: 'Cancel' }))?.props?.color).toBeUndefined()
  await drive(clock, ui.press({ key: 'cancel' }))
  const result = await drive(clock, call)
  expect(String(result.deny ?? result.text)).toContain(CANCELLED)
  await ui.unmount()
})

test('in a narrow terminal band, the report still fits: the hint goes, every long text truncates, and Proceed runs', async ($, on) => {
  const clock = engine(on, false)
  const { call, ui } = await hold($, clock, 'terminal', { ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  expect(await ui.find({ type: 'Text', text: 'Blast Radius' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude is waiting on your answer' })).toBeUndefined()
  for (const text of ['rm -rf build', 'build/index.html', 'Paths: build']) {
    expect((await ui.find({ type: 'Text', text }))?.props).toMatchObject({ wrap: 'truncate' })
  }
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  await drive(clock, ui.press({ key: 'proceed' }))
  const result = await drive(clock, call)
  expect(result.deny).toBeUndefined()
  expect(result.text).toBe('ran')
  await ui.unmount()
})

test('in a narrow terminal band, a long note breaks between words onto a second line instead of being cut at the first', async ($, on) => {
  // Nothing matches, so the note says why rm has nothing to remove: 51 cells, in 26.
  const clock = engine(on, false, '0 0 0')
  const { call, ui } = await hold($, clock, 'terminal', { ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  expect(await ui.find({ type: 'Text', text: "The paths don't exist, so" })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: 'rm has nothing to remove.' }))?.props).toMatchObject({ wrap: 'truncate', dimColor: true })
  await drive(clock, ui.press({ key: 'cancel' }))
  await drive(clock, call)
  await ui.unmount()
})

test('the desktop draws the held command, what it would delete and real buttons; Cancel refuses', async ($, on) => {
  const clock = engine(on)
  const { call, ui } = await hold($, clock, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'rm -rf' })).toBeDefined()
  expect(await ui.find({ type: 'Code', text: 'rm -rf build' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'delete 13 files (about 48 KB)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'build/assets/index.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+ 11 more' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Paths: build' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude is waiting on your answer' })).toBeDefined()
  // Not the terminal's drawing: no ⚠ title line.
  expect(await ui.find({ type: 'Text', text: /Blast Radius/ })).toBeUndefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  await drive(clock, ui.press({ key: 'cancel' }))
  const result = await drive(clock, call)
  expect(String(result.deny ?? result.text)).toContain(CANCELLED)
  await ui.unmount()
})

test('Proceed on the desktop lets the command run', async ($, on) => {
  const clock = engine(on)
  const { call, ui } = await hold($, clock, 'desktop')
  await drive(clock, ui.press({ key: 'proceed' }))
  const result = await drive(clock, call)
  expect(result.deny).toBeUndefined()
  expect(result.text).toBe('ran')
  await ui.unmount()
})

test('with no room for a pane, the band on the desktop draws the report and answers the hold', async ($, on) => {
  const clock = engine(on, false)
  const { call, ui } = await hold($, clock, 'desktop', BAND)
  expect(await ui.find({ type: 'Text', text: 'Blast Radius' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'delete 13 files (about 48 KB)' })).toBeDefined()
  await drive(clock, ui.press({ key: 'proceed' }))
  const result = await drive(clock, call)
  expect(result.text).toBe('ran')
  await ui.unmount()
})
