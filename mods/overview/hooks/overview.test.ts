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

/**
 * What the repo beneath is like, set per test: the checked-out branch (one
 * other than main is a workspace), and which reads fail (git's status, gh).
 */
const world = { head: 'main', down: new Set<'git' | 'gh'>() }

const gitStatus = () => GIT_STATUS.replace('# branch.head main', `# branch.head ${world.head}`)

/** The workspace's PR, on the `lane` branch. */
const LANE_PR = {
  number: 9,
  title: 'Overview adopts the kit',
  url: 'https://github.com/satoramoto/awesome-claude/pull/9',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: '',
  statusCheckRollup: [{ name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE' }],
  headRefName: 'lane',
  mergeable: 'MERGEABLE',
}

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
  if (cmd === 'git --no-optional-locks status --porcelain=v2 --branch') return world.down.has('git') ? fail : ok(gitStatus())
  if (cmd === 'git --no-optional-locks worktree list --porcelain') return ok('worktree /repo\nHEAD 0123\nbranch refs/heads/main\n')
  if (cmd === 'git --no-optional-locks diff --shortstat HEAD') return ok(' 1 file changed, 12 insertions(+), 3 deletions(-)\n')
  if (cmd === 'git rev-parse --abbrev-ref origin/HEAD') return ok('origin/main\n')
  if (cmd.startsWith('gh ') && world.down.has('gh')) return { ...fail, stderr: 'error connecting to api.github.com' }
  if (cmd.startsWith('gh pr list --author @me')) return ok(JSON.stringify(GH_PRS))
  if (cmd.startsWith('gh pr list --state all')) return ok(JSON.stringify([LANE_PR]))
  // The workspace on `lane`: it exists, and its lines changed against main.
  if (cmd === 'git rev-parse --git-dir') return ok('.git\n')
  if (cmd === `git --no-optional-locks rev-parse --verify --quiet refs/heads/${world.head}`) return ok('0123\n')
  if (cmd === `git --no-optional-locks rev-parse --abbrev-ref HEAD`) return ok(`${world.head}\n`)
  if (cmd === `git --no-optional-locks diff --shortstat origin/main...${world.head}`) return ok(' 9 files changed, 1204 insertions(+), 385 deletions(-)\n')
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
  // The end of a turn, beneath the mod's hook that counts it.
  on('turn.complete', async () => ({ text: '' }))
  return clock
}

/** Opens the pane with /overview, which reads everything again on the next tick, and lets that tick run. */
const reopen = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.command.run({ command: 'overview', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  // One tick of the mod's timer: git, then gh.
  await clock.advance(3_000)
}

/** A session that started, opened the pane with /overview, and read git and gh once. */
const session = async ($: Engine, on: On, head = 'main') => {
  world.head = head
  world.down.clear()
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await reopen($, clock)
  return clock
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

/** An element description's key and children, as the drawn tree carries them. */
type Drawn = { type?: string; key?: string; props?: Record<string, any>; children?: unknown[] }
const keyOf = (d: Drawn) => d.key ?? d.props?.key
const kids = (d: Drawn) => ((d.children ?? d.props?.children ?? []) as unknown[]).flat(Infinity).filter((c): c is Drawn => !!c && typeof c === 'object')
/** Every Text under an element, depth first. */
const texts = (d: Drawn): Drawn[] => (d.type === 'Text' ? [d] : []).concat(kids(d).flatMap(texts))
const shown = (d: Drawn): string => ((d.children ?? d.props?.children ?? []) as unknown[]).flat(Infinity).map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : c && typeof c === 'object' ? shown(c as Drawn) : '')).join('')

test('a section header is the rules look: a bold orange title, a dim ─ rule out to the figures', async ($, on) => {
  await session($, on)
  for (const columns of [40, 60]) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    // The title: bold, in Claude orange (the `claude` theme key, which no status uses).
    const title = await ui.find({ type: 'Text', text: 'Agents' })
    expect(title?.props, `title at ${columns}`).toMatchObject({ bold: true, color: 'claude', wrap: 'truncate' })
    // The header row: the title, then the rule, then the figures, in that order.
    const section = (await ui.find({ key: 'section-agents' })) as Drawn | undefined
    const row = kids(section ?? {})[0] ?? {}
    expect(kids(row).map(keyOf), `header at ${columns}`).toEqual(['title', 'rule', 'right'])
    const [head, rule, right] = kids(row)
    // The arrow and icon before the title are dim: orange is the title's alone, so no orange glyph sits by an amber one.
    const marks = texts(head!).filter(t => shown(t) !== 'Agents')
    expect(marks.length, `icon at ${columns}`).toBeGreaterThan(0)
    expect(marks.every(t => t.props?.dimColor === true && t.props?.color !== 'claude'), `icon at ${columns}`).toBe(true)
    // The rule takes all the room between them (it grows from no width) and is long enough to reach.
    expect(rule!.props, `rule box at ${columns}`).toMatchObject({ flexGrow: 1, width: 0, overflow: 'hidden' })
    const line = texts(rule!)[0]
    expect(line?.props?.dimColor, `rule at ${columns}`).toBe(true)
    expect(shown(line!), `rule at ${columns}`).toMatch(/^─+$/)
    expect([...shown(line!)].length, `rule at ${columns}`).toBeGreaterThanOrEqual(columns)
    // The figures: values bold, units dim italic.
    expect(shown(right!)).toMatch(/\d+ started {2}\d+ running/)
    const figure = texts(right!).find(t => /^\d+$/.test(shown(t)))
    const unit = texts(right!).find(t => shown(t) === ' started')
    expect(figure?.props?.bold, `figure at ${columns}`).toBe(true)
    expect(unit?.props, `unit at ${columns}`).toMatchObject({ dimColor: true, italic: true })
    await ui.unmount()
  }
})

test('the context bar and its scale span the section body at every width, the compaction mark amber', async ($, on) => {
  await session($, on)
  for (const columns of WIDTHS) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    const bar = await ui.find({ type: 'Text', text: /^[█▓▏▎▍▌▋▊▉░]+$/ })
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
  expect(await ui.find({ type: 'Text', text: 'Terminal inspector' })).toBeDefined()
  // The number sits on the right as meta, the part that goes first when the row is narrow.
  expect((await ui.find({ type: 'Text', text: '#7' }))?.props).toMatchObject({ dimColor: true, italic: true })
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
    // Nothing with an emoji presentation, which some terminals draw two cells wide.
    expect(texts).not.toMatch(/(?![#*0-9$])\p{Emoji}/u)
    await ui.unmount()
  }
})

test("a header's figures are one line that ends in an ellipsis when cut, not a figure clipped mid-word", async ($, on) => {
  await session($, on)
  for (const columns of WIDTHS) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    expect((await ui.find({ type: 'Text', text: /^\d+ started {2}\d+ running$/ }))?.props, `agents at ${columns}`).toMatchObject({ wrap: 'truncate' })
    await ui.unmount()
  }
})

/** The Texts a section draws, header and body. */
const sectionTexts = async (ui: { find: (q: { key: string }) => Promise<unknown> }, id: string) => texts(((await ui.find({ key: `section-${id}` })) ?? {}) as Drawn)
/** One section's drawn text, run together. */
const sectionText = async (ui: { find: (q: { key: string }) => Promise<unknown> }, id: string) => shown(((await ui.find({ key: `section-${id}` })) ?? {}) as Drawn)

test("before the first reads, Context and Git hold their figures' place with the pending ◌", async ($, on) => {
  world.head = 'main'
  world.down.clear()
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(40) })
  for (const id of ['context', 'git']) {
    const pending = (await sectionTexts(ui, id)).filter(t => shown(t) === '◌').map(t => t.props?.color)
    expect(pending, id).toContain('suggestion')
  }
  // No hand-written word stands in for the figures.
  expect(await ui.find({ type: 'Text', text: /measuring/ })).toBeUndefined()
  expect(await sectionText(ui, 'git')).toMatch(/Reading git…/)
  expect(await sectionText(ui, 'context')).toMatch(/Reading context…/)
  await ui.unmount()
})

test("the context legend keys the bar's parts with its own █ and ▓ in turn; the free room and buffer with ■", async ($, on) => {
  await session($, on)
  for (const columns of [40, 60]) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    const legend = async (key: string) => texts(((await ui.find({ key })) ?? {}) as Drawn).map(shown)
    const keys = [...(await legend('ctx')), ...(await legend('ctx-room'))].filter(t => /^[█▓■]$/.test(t))
    // The bar's parts (System, MCP, Messages): █ ▓ █, as the bar draws them; then Free and Buffer.
    expect(keys, `at ${columns}`).toEqual(['█', '▓', '█', '■', '■'])
    await ui.unmount()
  }
})

test('the tokens each turn added are a Braille sparkline across Accounting', async ($, on) => {
  const clock = await session($, on)
  const usage = (output: number) => ({ input_tokens: 2_000, output_tokens: output, cache_read_input_tokens: 60_000, cache_creation_input_tokens: 1_000, model: 'claude-opus-5-5' })
  for (const [i, output] of [800, 4_000, 1_500, 12_000].entries()) {
    await $.turn.complete({ answer: '', durationMs: 20_000, isAborted: false, turnId: `t${i}`, reason: 'answer', usage: usage(output) } as never)
  }
  await clock.settle()
  for (const columns of [40, 60]) {
    const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(columns) })
    // The last turn's tokens: input, output and cache writes; cache reads restate the context.
    expect(await sectionText(ui, 'accounting')).toMatch(/15k last turn/)
    const rows = (await sectionTexts(ui, 'accounting')).map(shown).filter(t => /^[⠀-⣿ ]+$/.test(t) && /[^ ]/.test(t))
    expect(rows.length, `at ${columns}`).toBe(2)
    for (const row of rows) expect([...row].length, `at ${columns}`).toBe(columns - 2)
    // Newest on the right edge: the last cell has dots.
    expect(rows.at(-1)!.at(-1), `at ${columns}`).not.toBe(' ')
    await ui.unmount()
  }
})

test('a git refresh that fails keeps the last-good figures, with an amber ▲ and their age in the header', async ($, on) => {
  const clock = await session($, on)
  world.down.add('git')
  await reopen($, clock)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(60) })
  const head = (await sectionTexts(ui, 'git')).map(t => [shown(t), t.props?.color] as const)
  expect(head.find(([t]) => t === '▲')?.[1]).toBe('warning')
  expect(head.some(([t]) => /^ \d+[smhd]$/.test(t))).toBe(true)
  // The body is the last-good checkout, not an error.
  expect(await ui.find({ type: 'Text', text: 'main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑2' })).toBeDefined()
  expect(await sectionText(ui, 'git')).not.toMatch(/git status failed|not answered/)
  await ui.unmount()

  // The next good read clears the mark.
  world.down.delete('git')
  await reopen($, clock)
  const again = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(60) })
  expect((await sectionTexts(again, 'git')).some(t => shown(t) === '▲')).toBe(false)
  await again.unmount()
})

test('a gh refresh that fails keeps the last pull requests, in Git and in Workspaces, marked ▲', async ($, on) => {
  const clock = await session($, on, 'lane')
  world.down.add('gh')
  await reopen($, clock)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(60) })
  for (const id of ['git', 'workspaces']) {
    expect((await sectionTexts(ui, id)).find(t => shown(t) === '▲')?.props?.color, id).toBe('warning')
  }
  expect(await ui.find({ type: 'Text', text: 'Terminal inspector' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Overview adopts the kit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /error connecting/ })).toBeUndefined()
  await ui.unmount()
})

test("a workspace's PR row drops its lines changed before CI when the row runs out of room", async ($, on) => {
  await session($, on, 'lane')
  const wide = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(60) })
  const row = async (ui: typeof wide) => shown(((await ui.find({ key: 'branch-lane-pr' })) ?? {}) as Drawn)
  // Its lines against main, the checkout's uncommitted ones included.
  expect(await row(wide)).toMatch(/\+1216 −388/)
  expect(await row(wide)).toMatch(/✕ 1 failing/)
  await wide.unmount()
  const narrow = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(30) })
  expect(await row(narrow)).not.toMatch(/\+1216/)
  expect(await row(narrow)).toMatch(/✕ 1 failing/)
  await narrow.unmount()
})

test('below 30 columns each section draws its header and figures only', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...pane(28) })
  for (const title of ['Context', 'Limits', 'Agents', 'Git', 'Accounting']) expect(await ui.find({ type: 'Text', text: title }), title).toBeDefined()
  // The figures say what matters on their own: the fullest limit window is in its header.
  expect(await sectionText(ui, 'limits')).toMatch(/96% weekly/)
  expect(await sectionText(ui, 'context')).toMatch(/31% of 200k/)
  // No bodies: no bar, no readings, no rows.
  expect(await ui.find({ type: 'Text', text: /^[█▓▏▎▍▌▋▊▉░]+$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '5-hour' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Model' })).toBeUndefined()
  await ui.unmount()
})
