import { atom, read, update } from 'claude-code'
import type { CommandRunInput, EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register } from 'claude-code'

import type { LaunchConfig, LaunchFile, Server, Status } from '../types'
import { LOOK, commandOf, renderPane, urlOf } from './view'
import type { PaneElements } from './view'

const PANE = 'launcher'
const TITLE = 'Launcher'
/** How many lines of a server's output are kept. */
const LOG_LINES = 200

const file = atom({ plugin: 'launcher', key: 'file' } as const, null)
const servers = atom({ plugin: 'launcher', key: 'servers' } as const, {})
const open = atom({ plugin: 'launcher', key: 'open' } as const, [])

// ---- reading .claude/launch.json ----

const trim = (dir: string) => (dir.length > 1 ? dir.replace(/[\\/]+$/, '') : dir)
const parent = (dir: string) => {
  const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  return cut <= 0 ? dir.slice(0, cut + 1) || dir : dir.slice(0, cut)
}
/** `rel` under `root`, unless it's absolute already. */
export const resolvePath = (root: string, rel: string) => (/^([\\/]|[A-Za-z]:)/.test(rel) ? rel : `${trim(root)}/${rel.replace(/^\.\/?/, '')}`.replace(/\/$/, ''))

/** The configurations of a launch.json's text; entries missing a name, an executable or a port are left out. */
export const parseLaunch = (text: string, root: string, at: number): LaunchFile => {
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return { root, configs: [], at, note: 'Unreadable .claude/launch.json (not JSON).' }
  }
  const configs: LaunchConfig[] = []
  for (const c of Array.isArray(json?.configurations) ? json.configurations : []) {
    const port = Number(c?.port)
    if (typeof c?.name !== 'string' || !c.name || typeof c.runtimeExecutable !== 'string' || !Number.isInteger(port) || port <= 0) continue
    if (configs.some(x => x.name === c.name)) continue
    configs.push({
      name: c.name,
      runtimeExecutable: c.runtimeExecutable,
      runtimeArgs: Array.isArray(c.runtimeArgs) ? c.runtimeArgs.map(String) : [],
      port,
      ...(typeof c.cwd === 'string' && c.cwd ? { cwd: c.cwd } : {}),
      ...(c.env && typeof c.env === 'object' ? { env: Object.fromEntries(Object.entries(c.env).map(([k, v]) => [k, String(v)])) } : {}),
      ...(c.autoPort ? { autoPort: true } : {}),
    })
  }
  return { root, configs, at }
}

/** The folder holding `.claude/launch.json`: the session's, or the nearest above it up to the git root. */
const findRoot = async ($: EngineInterface): Promise<string | null> => {
  let dir = trim(await $.session.cwd())
  for (let i = 0; i < 64; i++) {
    if (await $.fs.exists(`${dir}/.claude/launch.json`).catch(() => false)) return dir
    if (await $.fs.exists(`${dir}/.git`).catch(() => false)) return null
    const up = parent(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}

const loadFile = async ($: EngineInterface): Promise<LaunchFile> => {
  const at = Date.now()
  const root = await findRoot($)
  if (!root) return { root: trim(await $.session.cwd()), configs: [], at, note: 'No .claude/launch.json in this project.' }
  try {
    return parseLaunch(String(await $.fs.read(`${root}/.claude/launch.json`)), root, at)
  } catch {
    return { root, configs: [], at, note: 'Could not read .claude/launch.json.' }
  }
}

// ---- which ports answer ----

/** The TCP ports `lsof -nP -iTCP -sTCP:LISTEN -Fn` lists as listening. */
export const portsFromLsof = (stdout: string): Set<number> => {
  const ports = new Set<number>()
  for (const line of stdout.split('\n')) {
    const m = /^n.*:(\d+)$/.exec(line.trim())
    if (m) ports.add(Number(m[1]))
  }
  return ports
}

/** The process listening on each TCP port, from `lsof -Fpn`'s `p<pid>` and `n<addr>:<port>` lines. */
export const pidsFromLsof = (stdout: string): Map<number, number> => {
  const pids = new Map<number, number>()
  let pid = 0
  for (const line of stdout.split('\n')) {
    const l = line.trim()
    if (l.startsWith('p')) pid = Number(l.slice(1)) || 0
    const m = /^n.*:(\d+)$/.exec(l)
    if (m && pid && !pids.has(Number(m[1]))) pids.set(Number(m[1]), pid)
  }
  return pids
}

/** `ps -o pid=,%cpu=,rss=` lines: each process's CPU percent and resident memory in bytes. */
export const usageFromPs = (stdout: string): Map<number, { cpu: number; rss: number }> => {
  const usage = new Map<number, { cpu: number; rss: number }>()
  for (const line of stdout.split('\n')) {
    const [pid, cpu, rss] = line.trim().split(/\s+/).map(Number)
    if (pid && Number.isFinite(cpu) && Number.isFinite(rss)) usage.set(pid, { cpu: cpu!, rss: rss! * 1024 })
  }
  return usage
}

/** The last probe: every port something listens on, and the process on each where lsof said. */
let listening = new Set<number>()
let pidOf = new Map<number, number>()

/** Which ports answer: lsof's listening sockets, or, without lsof, an HTTP request to each configuration's port. */
const probe = async ($: EngineInterface, wanted: number[]) => {
  try {
    const run = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], { timeoutMs: 5_000 })
    // lsof exits 1 when nothing listens at all.
    listening = portsFromLsof(run.stdout)
    pidOf = pidsFromLsof(run.stdout)
  } catch {
    const answers = await Promise.all(wanted.map(p => $.http.fetch(urlOf(p)).then(() => p, () => null)))
    listening = new Set(answers.filter((p): p is number => p !== null))
    pidOf = new Map()
  }
}

/** How many CPU samples a server keeps: two minutes of ticks. */
const USAGE_SAMPLES = 60
/** Each answering server's CPU samples and last memory, by configuration name. */
const usage = new Map<string, { cpu: number[]; rss: number }>()

/**
 * One CPU and memory sample of each answering server's listening process: one
 * `ps` for all of them, after the probe that found their pids. Servers that
 * stopped answering lose their samples. Without lsof's pids or ps, nothing.
 */
const sample = async ($: EngineInterface, configs: LaunchConfig[]) => {
  const pids = new Map<string, number>()
  for (const c of configs) {
    const pid = pidOf.get(children.get(c.name)?.port ?? c.port)
    if (pid) pids.set(c.name, pid)
  }
  for (const name of [...usage.keys()]) if (!pids.has(name)) usage.delete(name)
  if (!pids.size) return
  let got: Map<number, { cpu: number; rss: number }>
  try {
    got = usageFromPs((await $.process.run(['ps', '-o', 'pid=,%cpu=,rss=', '-p', [...new Set(pids.values())].join(',')], { timeoutMs: 5_000 })).stdout)
  } catch {
    return
  }
  for (const [name, pid] of pids) {
    const now = got.get(pid)
    if (!now) {
      usage.delete(name)
      continue
    }
    const u = usage.get(name) ?? { cpu: [], rss: 0 }
    u.cpu = [...u.cpu, now.cpu].slice(-USAGE_SAMPLES)
    u.rss = now.rss
    usage.set(name, u)
  }
}

/** The first port from `from` up that nothing listens on. */
const freePort = (from: number) => {
  let port = from
  while (listening.has(port) && port < 65_535) port++
  return port
}

// ---- the servers this session started ----

type Child = {
  stream: HookStream<ProcessSpawnChunk, ProcessSpawnResult>
  port: number
  startedAt: number
  /** Stop was asked for, so its end isn't a failure. */
  stopping: boolean
  /** Settles once the child is gone and its state written. */
  done: Promise<void>
}

/**
 * The children this module started, by configuration name. Each lives as long
 * as its spawn loop: Stop ends the loop, and the module unloading (the session
 * ending, a reload) kills every one.
 */
const children = new Map<string, Child>()
/** Each server's output: whole lines and the line still being written. */
const logs = new Map<string, { lines: string[]; partial: string }>()
/** Names whose Start is under way but not yet spawned, so a second Start can't spawn twice. */
const starting = new Set<string>()
/** How long Stop waits for a child's loop to end before answering anyway. */
const STOP_WAIT = 3_000

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g

/** Adds output to a server's log, a line at a time, keeping the last LOG_LINES. */
export const appendLog = (log: { lines: string[]; partial: string }, text: string) => {
  const parts = (log.partial + text.replace(ANSI, '')).split('\n')
  log.partial = parts.pop() ?? ''
  for (const p of parts) log.lines.push(p.replace(/\r$/, '').replace(/^.*\r/, ''))
  if (log.lines.length > LOG_LINES) log.lines.splice(0, log.lines.length - LOG_LINES)
}

const logOf = (name: string) => {
  const log = logs.get(name)
  if (!log) return undefined
  return log.partial ? [...log.lines, log.partial].slice(-LOG_LINES) : [...log.lines]
}

/** Every configuration's server as it stands: what this session runs, what answers, how the last one ended. */
const reconcile = async ($: EngineInterface) => {
  const f = await read($, file)
  const old = await read($, servers)
  const next: Record<string, Server> = {}
  for (const c of f?.configs ?? []) {
    const prev = old[c.name]
    const child = children.get(c.name)
    let status: Status
    if (starting.has(c.name)) status = 'starting'
    else if (child) status = listening.has(child.port) ? 'running' : 'starting'
    else if (listening.has(c.port)) status = 'elsewhere'
    else if (prev?.status === 'failed') status = 'failed'
    else status = 'stopped'
    const used = status === 'running' || status === 'elsewhere' ? usage.get(c.name) : undefined
    next[c.name] = {
      status,
      port: child?.port ?? c.port,
      log: logOf(c.name) ?? prev?.log ?? [],
      code: child ? null : (prev?.code ?? null),
      startedAt: child?.startedAt ?? 0,
      ...(used ? { cpu: used.cpu, rss: used.rss } : {}),
    }
  }
  // Only a real change redraws.
  if (JSON.stringify(next) !== JSON.stringify(old)) await update($, servers, () => next)
}

/** Starts a configuration's server; answers what happened, in a line. */
const start = async ($: EngineInterface, name: string): Promise<string> => {
  const f = await read($, file)
  const c = f?.configs.find(x => x.name === name)
  if (!f || !c) return `No configuration named "${name}"${f?.configs.length ? ` (have: ${f.configs.map(x => x.name).join(', ')})` : ''}.`
  if (children.has(name)) return `${name} is already running from this session on ${urlOf(children.get(name)!.port)}.`
  if (starting.has(name)) return `${name} is already starting.`
  // Reserved before the first await, so a second Start meanwhile spawns nothing.
  starting.add(name)
  try {
    return await spawnIt($, name, f, c)
  } finally {
    starting.delete(name)
    await reconcile($).catch(() => undefined)
  }
}

const spawnIt = async ($: EngineInterface, name: string, f: LaunchFile, c: LaunchConfig): Promise<string> => {
  await reconcile($)
  await probe($, [c.port])
  let port = c.port
  if (listening.has(port)) {
    if (!c.autoPort) {
      return `${name}: port ${port} is in use by another process (started elsewhere); not starting it twice.`
    }
    port = freePort(port)
  }
  const argv = [c.runtimeExecutable, ...c.runtimeArgs]
  const stream = $.process.spawn({ argv, cwd: c.cwd ? resolvePath(f.root, c.cwd) : f.root, env: { ...c.env, PORT: String(port) } })
  logs.set(name, { lines: [`$ ${commandOf(c)}`], partial: '' })
  const child: Child = { stream, port, startedAt: Date.now(), stopping: false, done: Promise.resolve() }
  children.set(name, child)
  child.done = run($, name, child).catch(() => undefined)
  return `Starting ${name} on ${urlOf(port)} (${commandOf(c)}).`
}

/** Reads the child's output until it ends, then writes how it ended. */
const run = async ($: EngineInterface, name: string, child: Child) => {
  const log = logs.get(name)!
  let result: ProcessSpawnResult | undefined
  let cannot = false
  try {
    for (;;) {
      const piece = await child.stream.next()
      if (piece.done) {
        result = piece.value
        break
      }
      appendLog(log, piece.value.text)
    }
  } catch (err) {
    cannot = !child.stopping
    if (cannot) appendLog(log, `\n${err instanceof Error ? err.message : String(err)}\n`)
  }
  if (children.get(name) === child) children.delete(name)
  const failed = !child.stopping && (cannot || result?.code !== 0)
  if (!child.stopping && result) appendLog(log, `\n${result.signal ? `ended by ${result.signal}` : `exited with code ${result.code}`}\n`)
  const ended: Server = { status: failed ? 'failed' : 'stopped', port: child.port, log: logOf(name) ?? [], code: result?.code ?? null, startedAt: 0 }
  // A newer child of the same name owns the row now.
  if (children.has(name) || starting.has(name)) return
  await update($, servers, s => ({ ...s, [name]: ended }))
  // A failure unfolds its row, so its output is in view.
  if (failed) await update($, open, o => (o.includes(name) ? o : [...o, name]))
}

/** Ends a server this session started; answers what happened, in a line. */
const stop = async ($: EngineInterface, name: string): Promise<string> => {
  const child = children.get(name)
  if (!child) {
    const s = (await read($, servers))[name]
    return s?.status === 'elsewhere'
      ? `${name} on ${urlOf(s.port)} was started elsewhere (another session or the desktop app); stop it there.`
      : `${name} isn't running from this session.`
  }
  child.stopping = true
  // Leaving the loop kills the child: return() ends the stream the loop reads.
  void child.stream.return({ code: null, signal: 'SIGTERM' }).catch(() => undefined)
  // A server that ignores the end mustn't hang Stop.
  const wait = new AbortController()
  await Promise.race([child.done, $.clock.sleep(STOP_WAIT, { signal: wait.signal }).catch(() => undefined)])
  wait.abort()
  if (children.get(name) === child) children.delete(name)
  await probe($, [child.port]).catch(() => undefined)
  await reconcile($)
  return `Stopped ${name}.`
}

const restart = async ($: EngineInterface, name: string) => {
  if (children.has(name)) await stop($, name)
  return start($, name)
}

// ---- reading while the pane is shown ----

// Nothing runs while the pane isn't shown (but the children's own loops): a
// timer probes the ports every tick while it is, and reads launch.json again
// every FILE_EVERY.
const TICK = 2_000
const FILE_EVERY = 10_000
let fileAt = 0
let busy = false
let shownAt = 0
let shown = false

const isShown = async ($: EngineInterface): Promise<boolean> => {
  if (Date.now() - shownAt < 2_000) return shown
  shownAt = Date.now()
  try {
    shown = (await $.ui.panes()).some(p => p.id === PANE && p.isShown && p.isPlaced)
  } catch {
    shown = false
  }
  return shown
}

const refresh = async ($: EngineInterface, readFile: boolean) => {
  if (busy) return
  busy = true
  try {
    if (readFile || !(await read($, file)) || Date.now() - fileAt >= FILE_EVERY) {
      fileAt = Date.now()
      const fresh = await loadFile($)
      const old = await read($, file)
      if (!old || JSON.stringify({ ...old, at: 0 }) !== JSON.stringify({ ...fresh, at: 0 })) await update($, file, () => fresh)
    }
    const configs = (await read($, file))?.configs ?? []
    await probe($, configs.map(c => c.port))
    await sample($, configs)
    await reconcile($)
  } finally {
    busy = false
  }
}

const tick = async ($: EngineInterface) => {
  if (await isShown($)) await refresh($, false)
}

// ---- the command ----

const USAGE = 'Usage: /launcher (opens the pane), /launcher start <name>, /launcher stop <name>, /launcher restart <name>, /launcher list.'

/** Every configuration on a line: name, state, where. */
const listing = async ($: EngineInterface) => {
  const f = await read($, file)
  if (!f) return 'Reading .claude/launch.json…'
  if (f.note) return f.note
  const s = await read($, servers)
  const lines = f.configs.map(c => {
    const one = s[c.name]
    const status = one?.status ?? 'stopped'
    const port = one?.port ?? c.port
    const where = status === 'running' || status === 'elsewhere' ? urlOf(port) : `:${port}`
    return `  ${c.name}  ${LOOK[status].word}  ${where}`
  })
  return [`${f.root}/.claude/launch.json:`, ...(lines.length ? lines : ['  (no configurations)'])].join('\n')
}

const command = async ($: EngineInterface, e: CommandRunInput) => {
  const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
  const name = rest.join(' ')
  await refresh($, true).catch(() => undefined)
  switch (verb.toLowerCase()) {
    case '': {
      // Opened by the person: read now rather than on the next tick.
      shownAt = 0
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: `${TITLE} pane opened.\n${await listing($)}` }
    }
    case 'list':
    case 'status':
      return { text: await listing($) }
    case 'start':
    case 'stop':
    case 'restart': {
      if (!name) return { text: `Which one? ${USAGE}` }
      const v = verb.toLowerCase()
      return { text: v === 'start' ? await start($, name) : v === 'stop' ? await stop($, name) : await restart($, name) }
    }
    default:
      return { text: USAGE }
  }
}

let worker: { cancel: () => void } | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const name of ['launcher', 'preview']) {
      await $.command.register({
        name,
        description: "Open a pane with this project's dev servers from .claude/launch.json, or start or stop one",
        argumentHint: '[start|stop|restart <name>]',
        immediate: true,
      })
    }
    worker?.cancel()
    worker = $.clock.every(TICK, () => void tick($).catch(() => undefined))
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'launcher' }, ($, e) => command($, e))
  on('command.run', { command: 'preview' }, ($, e) => command($, e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const say = (what: Promise<string>) => void what.then(text => (text.startsWith('Starting') || text.startsWith('Stopped') ? undefined : $.ui.toast(text))).catch(() => undefined)
    return renderPane(
      $.ui.resolve(e) as PaneElements,
      e.surface,
      e.props.bodyColumns,
      await read($, file),
      await read($, servers),
      await read($, open),
      {
        start: name => say(start($, name)),
        stop: name => say(stop($, name)),
        restart: name => say(restart($, name)),
        toggle: name => void update($, open, o => (o.includes(name) ? o.filter(n => n !== name) : [...o, name])).catch(() => undefined),
      },
      { focused: e.props.isFocused },
    )
  })
}
