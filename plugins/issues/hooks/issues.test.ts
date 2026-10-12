import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

/** What `gh issue list` answers: GH_ISSUES by default. */
type Gh = { exitCode: number; stdout: string; stderr: string }

/**
 * The engine beneath the mod: a clock that holds still, and gh answering
 * `issue list` with `issues` (GH_ISSUES by default) and `repo view` with the
 * repository. Returns the panes the mod opened, as `{ id, title }`.
 */
const engine = (on: On, issues: Gh = { exitCode: 0, stdout: JSON.stringify(GH_ISSUES), stderr: '' }) => {
  const opened: { id: string; title?: string }[] = []
  mock.clock(on, { now: NOW })
  // A call on `$` (an op) is answered with `{ value }`; an event like command.run with its result.
  on('session.cwd', async () => ({ value: '/repo' }))
  on('ui.open', async (_$, e) => {
    opened.push({ id: e.id, title: e.title })
    return { value: { isPlaced: true } }
  })
  on('command.run', async () => ({ text: '' }))
  on('process.run', async (_$, e) => ({
    value: {
      ...(e.argv[0] === 'gh' && e.argv[1] === 'issue' && e.argv[2] === 'list'
        ? issues
        : e.argv[0] === 'gh' && e.argv[1] === 'repo' && e.argv[2] === 'view'
          ? { exitCode: 0, stdout: 'satoramoto/awesome-claude\n', stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'not answered in this test' }),
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  return opened
}

/** `/issues` as the person types it; it settles once gh was read into state. */
const open = ($: Engine) =>
  $.command.run({ command: 'issues', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

test('the pane opens on its own when a session starts', async ($, on) => {
  const opened = engine(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([{ id: 'issues', title: 'Issues' }])
})

test('/issues opens a pane listing the open issues, on the terminal and the desktop', async ($, on) => {
  engine(on)
  await open($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'issues', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'satoramoto/awesome-claude' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Fold arrow is clipped in the desktop pane' })).toBeDefined()
    await ui.unmount()
  }
})

/** The pane on the terminal, `columns` wide. */
const terminal = ($: Engine, columns = 60) =>
  $.ui.mount({ plugin: 'issues', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: columns } })

test('on the terminal, a section titled with the repository, its counts on the right, an item per issue', async ($, on) => {
  engine(on)
  await open($)

  const ui = await terminal($)
  expect(await ui.find({ key: 'section-issues' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^satoramoto\/awesome-claude$/ }))?.props.bold).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^2 open$/ })).toBeDefined()
  // Each issue: the open-issue mark in green, its title, its number and its age on the right.
  expect(await ui.findAll({ type: 'Text', text: /^◉$/ })).toHaveLength(2)
  expect((await ui.find({ type: 'Text', text: /^◉$/ }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'row-24' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Snapshot tests of what mods draw$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^#24$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2h$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeDefined()
  await ui.unmount()
})

test('on the terminal, labels show as pills while they fit beside the title', async ($, on) => {
  engine(on)
  await open($)

  const wide = await terminal($, 60)
  // The label's colour (GitHub's hex) only tints its one-cell swatch; the name is the default foreground.
  const pill = await wide.find({ type: 'Text', text: /^■ tests$/ })
  expect(pill).toBeDefined()
  expect(pill?.props.color).toBeUndefined()
  expect((await wide.find({ type: 'Text', text: /^■$/ }))?.props.color).toBe('#0e8a16')
  await wide.unmount()

  // At 30 columns the title keeps its room and the label is left out; the number and age stay.
  const narrow = await terminal($, 30)
  expect(await narrow.find({ type: 'Text', text: /tests$/ })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /^#24$/ })).toBeDefined()
  await narrow.unmount()
})

test('on the terminal, reading is a dim note under the section', async ($, on) => {
  engine(on)
  const ui = await terminal($)
  expect((await ui.find({ type: 'Text', text: /^Reading issues…$/ }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('on the terminal, no open issues is a dim note under the repository', async ($, on) => {
  engine(on, { exitCode: 0, stdout: '[]', stderr: '' })
  await open($)
  const ui = await terminal($)
  expect(await ui.find({ type: 'Text', text: /^satoramoto\/awesome-claude$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^No open issues\.$/ }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('on the terminal, a gh failure is an error note: a red ✕ and the reason', async ($, on) => {
  engine(on, { exitCode: 1, stdout: '', stderr: 'none of the git remotes configured for this repository point to a known GitHub host' })
  await open($)
  const ui = await terminal($)
  expect((await ui.find({ type: 'Text', text: /^✕$/ }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: /^No GitHub repository for this session$/ })).toBeDefined()
  await ui.unmount()
})

test('on the desktop, Refine shows only on an unrefined issue, Start on every one', async ($, on) => {
  engine(on)
  await open($)

  const ui = await $.ui.mount({ plugin: 'issues', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'refine-24' })).toBeDefined()
  expect(await ui.find({ key: 'refine-23' })).toBeUndefined()
  expect(await ui.findAll({ type: 'Button', text: 'Start' })).toHaveLength(2)
  await ui.unmount()
})
