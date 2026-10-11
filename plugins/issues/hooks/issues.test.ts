import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// The issues pane drawn by the engine's test kit on each surface. The test's
// own hooks sit beneath the mod and stand for the engine: `process.run`
// answers `gh` with two open issues (as GitHub's JSON has them), so no real
// gh runs, and `/issues` opens the pane and reads them into the mod's state.
const NOW = Date.UTC(2026, 9, 11, 12)
const HOUR = 3_600_000
const URL = 'https://github.com/satoramoto/awesome-claude/issues'

const GH_ISSUES = [
  {
    number: 24,
    title: 'Snapshot tests of what mods draw',
    url: `${URL}/24`,
    author: { login: 'satoramoto' },
    labels: [{ name: 'tests', color: '0e8a16' }],
    assignees: [],
    comments: [{}, {}, {}],
    updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
  },
  {
    number: 23,
    title: 'Fold arrow is clipped in the desktop pane',
    url: `${URL}/23`,
    author: { login: 'satoramoto' },
    labels: [{ name: 'refined', color: '0e8a16' }],
    assignees: [{ login: 'satoramoto' }],
    comments: [],
    updatedAt: new Date(NOW - 5 * HOUR).toISOString(),
  },
]

const PANE = {
  component: 'Pane',
  requestId: 'issues',
  props: { title: 'Issues', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** The engine beneath the mod: a clock that holds still, and gh answering from GH_ISSUES. */
const engine = (on: On) => {
  mock.clock(on, { now: NOW })
  // A call on `$` (an op) is answered with `{ value }`; an event like command.run with its result.
  on('session.cwd', async () => ({ value: '/repo' }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('command.run', async () => ({ text: '' }))
  on('process.run', async (_$, e) => ({
    value:
      e.argv[0] === 'gh' && e.argv[1] === 'issue' && e.argv[2] === 'list'
        ? { exitCode: 0, stdout: JSON.stringify(GH_ISSUES), stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
        : { exitCode: 1, stdout: '', stderr: 'not answered in this test', isStdoutTruncated: false, isStderrTruncated: false },
  }))
}

// One test: the module (and its own variables) outlives a test, while each test
// starts with empty state, so a second `/issues` in a later test can draw nothing.
test('/issues opens a pane listing the open issues, on the terminal and the desktop', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'issues', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'issues', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'satoramoto/awesome-claude' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Fold arrow is clipped in the desktop pane' })).toBeDefined()
    if (surface === 'desktop') {
      // Refine only on the issue not yet labelled `refined`; Start on every one.
      expect(await ui.find({ key: 'refine-24' })).toBeDefined()
      expect(await ui.find({ key: 'refine-23' })).toBeUndefined()
      expect(await ui.findAll({ type: 'Button', text: 'Start' })).toHaveLength(2)
    }
    await ui.unmount()
  }
})
