import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The overview pane drawn by the engine's test kit, mostly on the terminal.
// The test's own hooks sit beneath the mod and stand for the engine: the
// session's usage (context and limits), its agents, git and gh answered from
// the fixtures below. `/overview` reads the usage; the mod's 3 s timer, moved
// by the mocked clock, reads git and gh.
const NOW = Date.UTC(2026, 9, 11, 12)
const MIN = 60_000

// The pane draws resets against the wall clock, so they're set from it.
const WALL = Date.now()

const USAGE = {
  startedAt: NOW - 47 * MIN,
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(WALL + 138 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 96, resetsAt: new Date(WALL + 76 * 60 * MIN).toISOString() },
  ],
  cost: { usd: 4.82 },
  context: {
    percent: 31,
    breakdown: {
      model: 'claude-opus-5-5',
      totalTokens: 61_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      percentage: 31,
      isAutoCompactEnabled: true,
      autoCompactThreshold: 167_000,
      categories: [
        { name: 'System prompt', tokens: 3_100, kind: 'used' },
        { name: 'System tools', tokens: 14_200, kind: 'used' },
        { name: 'MCP tools', tokens: 6_400, kind: 'used' },
        { name: 'Messages', tokens: 37_300, kind: 'used' },
        { name: 'Free space', tokens: 106_000, kind: 'free' },
        { name: 'Autocompact buffer', tokens: 33_000, kind: 'buffer' },
      ],
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      gridRows: [],
      apiUsage: null,
    },
  },
}

const AGENTS = [
  { id: 'a', description: 'Explore the render pipeline', type: 'Explore', status: 'completed' },
  { id: 'b', description: 'Lane: desktop layout', type: 'developer', status: 'running' },
  { id: 'c', description: 'Worker: legend bar', type: 'worker', status: 'running', parentId: 'b' },
  { id: 'd', description: 'Review the branch', type: 'reviewer', status: 'failed' },
]

const GIT_STATUS = [
  '# branch.oid 0123456789abcdef',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -0',
  '1 .M N... 100644 100644 100644 aaa bbb mods/overview/hooks/terminal.tsx',
  '',
].join('\n')

const GH_PRS = [
  {
    number: 7,
    title: 'Terminal inspector',
    url: 'https://github.com/satoramoto/awesome-claude/pull/7',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'REVIEW_REQUIRED',
    statusCheckRollup: [{ name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE' }],
    headRefName: 'terminal',
    mergeable: 'MERGEABLE',
  },
  {
    number: 6,
    title: 'Kit renderer',
    url: 'https://github.com/satoramoto/awesome-claude/pull/6',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'APPROVED',
    statusCheckRollup: [{ name: 'tests', status: 'IN_PROGRESS', conclusion: '' }],
    headRefName: 'kit',
    mergeable: 'MERGEABLE',
  },
]

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = { exitCode: 1, stdout: '', stderr: 'not answered in this test', isStdoutTruncated: false, isStderrTruncated: false }

/** git and gh as the repo above has them; anything else fails. */
const answer = (argv: readonly string[]) => {
  const cmd = argv.join(' ')
  if (cmd === 'git --no-optional-locks rev-parse --show-toplevel') return ok('/repo\n')
  if (cmd === 'git --no-optional-locks status --porcelain=v2 --branch') return ok(GIT_STATUS)
  if (cmd === 'git --no-optional-locks worktree list --porcelain') return ok('worktree /repo\nHEAD 0123\nbranch refs/heads/main\n')
  if (cmd === 'git --no-optional-locks diff --shortstat HEAD') return ok(' 1 file changed, 12 insertions(+), 3 deletions(-)\n')
  if (cmd === 'git rev-parse --abbrev-ref origin/HEAD') return ok('origin/main\n')
  if (cmd.startsWith('gh pr list --author @me')) return ok(JSON.stringify(GH_PRS))
  return fail
}

/** The engine beneath the mod; the clock it returns moves the mod's timer. */
const engine = (on: On) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('command.run', async () => ({ text: '' }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.panes', async () => ({ value: [{ id: 'overview', title: 'Overview', isShown: true, isFocused: false, isPlaced: true }] }) as never)
  on('session.usage', async () => ({ value: USAGE }) as never)
  on('agent.list', async () => ({ value: AGENTS }) as never)
  on('process.run', async (_$, e) => ({ value: answer(e.argv) }))
  return clock
}

/** A session that started, opened the pane with /overview, and read git and gh once. */
const session = async ($: Engine, on: On) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'overview', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  // One tick of the mod's timer: git, then gh.
  await clock.advance(3_000)
}

const pane = (columns: number) =>
  ({
    component: 'Pane',
    requestId: 'overview',
    props: { title: 'Overview', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as const

const WIDTHS = [30, 40, 60, 100] as const

test('the terminal lists the same sections as the desktop, in its order, each a section header', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(40) })
  const titles = (await ui.findAll({ type: 'Text' })).filter(t => t.props.bold).map(t => t.text)
  const order = ['Context', 'Limits', 'Agents', 'Git', 'Accounting'].map(s => titles.indexOf(s))
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  // Each section folds by its arrow, as on the desktop.
  for (const id of ['context', 'limits', 'agents', 'git', 'accounting']) expect(await ui.find({ key: `toggle-${id}` })).toBeDefined()
  await ui.unmount()
  // The desktop draws from the same data without a refusal.
  const desk = await $.ui.mount({ plugin: 'overview', surface: 'desktop', ...pane(46) })
  expect(await desk.find({ type: 'Text', text: 'Agents' })).toBeDefined()
  await desk.unmount()
})

test('the context bar and its scale span the section body at every width, the compaction mark amber', async ($, on) => {
  await session($, on)
  for (const columns of WIDTHS) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    const bar = await ui.find({ type: 'Text', text: /^[█▏▎▍▌▋▊▉░]+$/ })
    expect([...(bar?.text ?? '')].length).toBe(columns - 2)
    const scale = await ui.find({ type: 'Text', text: /^[╵ ]*▴[╵ ]*$/ })
    expect([...(scale?.text ?? '')].length).toBe(columns - 2)
    expect((await ui.find({ type: 'Text', text: /^▴$/ }))?.props.color).toBe('warning')
    // The legend names the groups and what's left: the free room and the buffer.
    for (const label of ['System', 'MCP', 'Messages', 'Free', 'Buffer']) expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    await ui.unmount()
  }
})

test('limits are readings: label, gauge, percent and reset, red from 90%', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(40) })
  expect(await ui.find({ type: 'Text', text: '5-hour' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2h18m' })).toBeDefined()
  const weekly = (await ui.findAll({ type: 'Text', text: /^━+╸?$/ })).map(t => t.props.color)
  expect(weekly).toContain('error')
  await ui.unmount()
})

test('agents are a tree of status rows: running a blue ◐, done a green ✓, failed a red ✕', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(40) })
  const running = await ui.findAll({ type: 'Text', text: /^◐$/ })
  expect(running.length).toBe(2)
  expect(running.every(t => t.props.color === 'suggestion')).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^✓$/ }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: /^✕$/ }))?.props.color).toBe('error')
  // The worker sits under the lane that spawned it.
  expect(await ui.find({ type: 'Text', text: /^└─$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Worker: legend bar/ })).toBeDefined()
  // Folding the section leaves only its header.
  await ui.press({ key: 'toggle-agents' })
  expect(await ui.find({ type: 'Text', text: /^◐$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Agents' })).toBeDefined()
  await ui.unmount()
})

test('git lists the checkout and its pull requests as rows with a status', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(60) })
  expect(await ui.find({ type: 'Text', text: 'main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /terminal\.tsx/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /#7 Terminal inspector/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '✕ 1 failing' }))?.props.color).toBe('error')
  // A pending check is blue, as running is.
  expect((await ui.find({ type: 'Text', text: '◌ 1 pending' }))?.props.color).toBe('suggestion')
  expect(await ui.find({ type: 'Text', text: /review required/ })).toBeDefined()
  await ui.unmount()
})

test('the terminal draws only the kit glyphs: no ✗ ⚑ ⑂ ⟳ ● marks', async ($, on) => {
  await session($, on)
  for (const columns of WIDTHS) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    for (const glyph of ['✗', '⚑', '⑂', '⟳', '●']) expect(texts.includes(glyph)).toBe(false)
    await ui.unmount()
  }
})
