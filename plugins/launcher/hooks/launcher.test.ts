import type { On, ProcessSpawnRequest } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The launcher pane drawn by the engine's test kit on each surface. The test's
// hooks sit beneath the mod and stand for the engine: `fs` holds one project's
// .claude/launch.json, `lsof` lists the ports set in `listening`, and
// `process.spawn` records what was started and runs as the test says.
const NOW = Date.UTC(2026, 9, 11, 12)

const LAUNCH = {
  version: '0.0.1',
  configurations: [
    { name: 'app', runtimeExecutable: 'npm', runtimeArgs: ['--prefix', 'app', 'run', 'dev'], port: 5173, env: { NODE_ENV: 'development' } },
    { name: 'storybook', runtimeExecutable: 'npm', runtimeArgs: ['--prefix', 'app', 'run', 'storybook'], port: 6006 },
  ],
}

const PANE = {
  component: 'Pane',
  requestId: 'launcher',
  props: { title: 'Launcher', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const result = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

type World = {
  /** Ports something listens on, as lsof would list them. */
  listening: Set<number>
  /** Every spawn the mod asked for. */
  spawned: ProcessSpawnRequest[]
  /** Spawns that ended because the mod ended their loop. */
  killed: string[]
  /** The test's clock. */
  clock: ReturnType<typeof mock.clock>
  /** Every pane the mod opened. */
  opened: { id: string; title: string }[]
}

/**
 * The engine beneath the mod. The project is /repo with its launch.json, the
 * session in /repo/app (so the mod walks up). A spawned server writes a line
 * and runs until its loop ends, unless `crash` names it: then it fails at once.
 */
const engine = (on: On, opts: { crash?: string; hang?: string } = {}): World => {
  const clock = mock.clock(on, { now: NOW })
  const world: World = { listening: new Set([6006]), spawned: [], killed: [], clock, opened: [] }
  on('session.cwd', async () => ({ value: '/repo/app' }))
  on('ui.open', async (_$, e) => {
    world.opened.push({ id: e.id, title: e.title ?? '' })
    return { value: { isPlaced: true } }
  })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.toast', async () => ({ value: undefined }))
  on('command.run', async () => ({ text: '' }))
  on('fs.exists', async (_$, e) => ({ value: e.path === '/repo/.claude/launch.json' || e.path === '/repo/.git' }))
  on('fs.read', async (_$, e) => {
    if (e.path !== '/repo/.claude/launch.json') throw new Error(`ENOENT ${e.path}`)
    return { value: JSON.stringify(LAUNCH) }
  })
  on('process.run', async (_$, e) =>
    e.argv[0] === 'lsof' ? result([...world.listening].map(p => `p100\nf3\nn*:${p}`).join('\n'), world.listening.size ? 0 : 1) : result('', 1),
  )
  on('process.spawn', async function* (_$, e, next) {
    world.spawned.push(e)
    const name = e.argv.includes('dev') ? 'app' : 'storybook'
    if (opts.hang === name) {
      // Never writes, and ignores the abort: only Stop's own wait ends it.
      await new Promise<void>(() => undefined)
    }
    if (opts.crash === name) {
      yield { stream: 'stderr' as const, text: 'Error: Cannot find module vite\n' }
      return { value: { code: 1, signal: null } }
    }
    yield { stream: 'stdout' as const, text: '\x1b[32mVITE\x1b[0m ready in 300 ms\n' }
    // Runs until the mod leaves its loop, which aborts this dispatch.
    await new Promise<void>(resolve => (next.signal.aborted ? resolve() : next.signal.addEventListener('abort', () => resolve())))
    world.killed.push(name)
    return { value: { code: null, signal: 'SIGTERM' } }
  })
  return world
}

const launcher = ($: Engine, args = '') =>
  $.command.run({ command: 'launcher', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

test('the pane opens on its own when a session starts', async ($, on) => {
  const { opened } = engine(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo/app', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([{ id: 'launcher', title: 'Launcher' }])
})

test('/launcher opens a pane listing each configuration of launch.json, on the terminal and the desktop', async ($, on) => {
  engine(on)
  const { text } = await launcher($)
  expect(text).toContain('/repo/.claude/launch.json')
  expect(text).toContain('storybook  running elsewhere  http://localhost:6006')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'launcher', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'app' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'stopped' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'running elsewhere' })).toBeDefined()
    // A server something else runs can't be started twice; the stopped one can.
    expect(await ui.find({ key: 'start-app' })).toBeDefined()
    expect(await ui.find({ key: 'start-storybook' })).toBeUndefined()
    expect(await ui.find({ type: 'Link', text: 'localhost:6006' }), 'the URL of the one running elsewhere').toBeDefined()
    await ui.unmount()
  }
})

const mountAt = ($: Engine, surface: 'terminal' | 'desktop', bodyColumns: number) =>
  $.ui.mount({ plugin: 'launcher', surface, ...PANE, props: { ...PANE.props, bodyColumns } })

test('on the terminal, the head line, a blank row, then each row with its kit status and actions, at every width', async ($, on) => {
  engine(on, { crash: 'app' })
  await launcher($)
  for (const columns of [30, 40, 60, 100]) {
    const ui = await mountAt($, 'terminal', columns)
    expect(await ui.find({ type: 'Text', text: 'repo/.claude/launch.json' }), `head at ${columns}`).toBeDefined()
    expect((await ui.find({ key: 'top' }))?.props.marginBottom, `the blank row under the head at ${columns}`).toBe(1)
    // A stopped server's state is the kit's status: its glyph and word.
    expect(await ui.find({ type: 'Text', text: '■ stopped' }), `stopped at ${columns}`).toBeDefined()
    expect(await ui.find({ type: 'Button', text: 'Start' }), `Start at ${columns}`).toBeDefined()
    // The one running elsewhere keeps its glyph and its address, the word only where it fits.
    expect(await ui.find({ type: 'Text', text: '✓' }), `running elsewhere at ${columns}`).toBeDefined()
    expect(await ui.find({ type: 'Link', text: '6006' }), `its address at ${columns}`).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ running elsewhere' }), `the word at ${columns}`)[columns >= 40 ? 'toBeDefined' : 'toBeUndefined']()
    await ui.unmount()
  }

  // A crash unfolds its row: the exit code, then the output's tail, each line a dim note.
  await launcher($, 'start app')
  const ui = await mountAt($, 'terminal', 60)
  expect(await ui.find({ type: 'Text', text: '✕ failed' })).toBeDefined()
  const line = await ui.find({ type: 'Text', text: 'Error: Cannot find module vite' })
  expect(line?.props.dimColor).toBe(true)
  expect(line?.props.wrap).toBe('truncate')
  await ui.unmount()
})

for (const columns of [30, 40]) {
  test(`on the terminal at ${columns} columns, a starting row gives up its word and address before its Stop and Restart`, async ($, on) => {
    const world = engine(on)
    await launcher($)
    const ui = await mountAt($, 'terminal', columns)
    await ui.press({ key: 'start-app' })
    expect(world.spawned).toHaveLength(1)
    expect(await ui.find({ key: 'stop-app' })).toBeDefined()
    expect(await ui.find({ key: 'restart-app' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '◐' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '◐ starting' }))[columns >= 40 ? 'toBeDefined' : 'toBeUndefined']()
    await ui.press({ key: 'stop-app' })
    expect(world.killed).toEqual(['app'])
    await ui.unmount()
  })
}

test('Start runs the configuration in the project root with PORT set; it shows running once the port answers, and Stop ends it', async ($, on) => {
  const world = engine(on)
  await launcher($)

  const ui = await $.ui.mount({ plugin: 'launcher', surface: 'desktop', ...PANE })
  await ui.press({ key: 'start-app' })
  expect(world.spawned).toHaveLength(1)
  expect(world.spawned[0]!.argv).toEqual(['npm', '--prefix', 'app', 'run', 'dev'])
  expect(world.spawned[0]!.cwd).toBe('/repo')
  expect(world.spawned[0]!.env).toEqual({ NODE_ENV: 'development', PORT: '5173' })
  expect(await ui.find({ type: 'Text', text: 'starting' })).toBeDefined()
  expect(await ui.find({ key: 'stop-app' })).toBeDefined()
  expect(await ui.find({ key: 'start-app' })).toBeUndefined()

  // The port answers: the next read shows it running, with its URL.
  world.listening.add(5173)
  expect((await launcher($, 'list')).text).toContain('app  running  http://localhost:5173')
  expect(await ui.find({ type: 'Link', text: 'localhost:5173' }), 'its URL once it answers').toBeDefined()

  // Its output, colours stripped, unfolds under the row.
  await ui.press({ key: 'toggle-app' })
  expect(await ui.find({ type: 'Text', text: 'VITE ready in 300 ms' })).toBeDefined()

  world.listening.delete(5173)
  await ui.press({ key: 'stop-app' })
  expect(world.killed).toEqual(['app'])
  expect(await ui.find({ key: 'start-app' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'stopped' })).toBeDefined()
  await ui.unmount()
})

test('a server that exits with an error shows failed, unfolded with its output', async ($, on) => {
  engine(on, { crash: 'app' })
  await launcher($)
  expect((await launcher($, 'start app')).text).toContain('Starting app on http://localhost:5173')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'launcher', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'failed' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Error: Cannot find module vite' })).toBeDefined()
    expect(await ui.find({ key: 'start-app' })).toBeDefined()
    await ui.unmount()
  }
})

test('two Starts at once spawn one server', async ($, on) => {
  const world = engine(on)
  await launcher($)
  const [a, b] = await Promise.all([launcher($, 'start app'), launcher($, 'start app')])
  expect(world.spawned).toHaveLength(1)
  expect([a.text, b.text].some(t => t?.includes('already'))).toBe(true)
  await launcher($, 'stop app')
})

test('Stop answers even when the server never ends', async ($, on) => {
  const world = engine(on, { hang: 'app' })
  await launcher($)
  await launcher($, 'start app')
  const stopping = launcher($, 'stop app')
  await world.clock.advance(5_000)
  expect((await stopping).text).toContain('Stopped app')
})

test('/launcher start refuses a server whose port another process holds, and stop names where it runs', async ($, on) => {
  const world = engine(on)
  expect((await launcher($, 'start storybook')).text).toContain('port 6006 is in use by another process')
  expect((await launcher($, 'stop storybook')).text).toContain('started elsewhere')
  expect((await launcher($, 'start nope')).text).toContain('No configuration named "nope"')
  expect(world.spawned).toHaveLength(0)
})
