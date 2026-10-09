import { atom, read, update } from 'claude-code'
import type {
  AgentInfo,
  EngineInterface,
  ModelUsage,
  ProcessRunResult,
  Register,
  RenderElement,
  SessionContextBreakdown,
  SessionRateLimit,
  Timer,
} from 'claude-code'

import type {
  Activity,
  Agent,
  AgentExtra,
  GhInfo,
  GitFile,
  GitInfo,
  GitNote,
  GitPr,
  Item,
  Limit,
  Segment,
  Snapshot,
  TreeRow,
  TurnPoint,
} from '../types'
import { renderDesktop } from './desktop'
import type { AppElements, Helpers } from './desktop'

const PANE = 'overview'
const snapshot = atom({ plugin: 'overview', key: 'snapshot' } as const, null)
const agents = atom({ plugin: 'overview', key: 'agents' } as const, [])
const agentExtra = atom({ plugin: 'overview', key: 'agentExtra' } as const, {})
const now = atom({ plugin: 'overview', key: 'now' } as const, 0)
const TICK_MS = 1_000

// One hue per used category, in the order /context lists them.
export const PALETTE = ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#e0af68', '#f7768e', '#ff9e64', '#2ac3de']
const DETAIL_ITEMS = 5

export const formatTokens = (n: number): string => {
  if (n >= 999_500) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}k`
  return String(Math.round(n))
}

const trim = (n: number) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''))

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const top = (items: Item[]) => [...items].sort((a, b) => b.tokens - a.tokens).slice(0, DETAIL_ITEMS)

/** The breakdown as the band keeps it: used rows first, then free space, then the compaction buffer. */
export const toSnapshot = (b: SessionContextBreakdown): Snapshot => {
  const rows = b.categories.filter(c => c.kind !== 'deferred')
  const order = { used: 0, free: 1, buffer: 2, deferred: 3 }
  const segments: Segment[] = rows
    .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind }))
    .sort((x, y) => order[x.kind] - order[y.kind])

  const servers = new Map<string, number>()
  for (const tool of b.mcpTools) {
    if (tool.isLoaded) servers.set(tool.serverName, (servers.get(tool.serverName) ?? 0) + tool.tokens)
  }

  return {
    model: b.model,
    total: b.totalTokens,
    max: b.rawMaxTokens,
    percent: b.percentage,
    ...(b.isAutoCompactEnabled && b.autoCompactThreshold ? { compactAt: b.autoCompactThreshold } : {}),
    segments,
    memory: top(b.memoryFiles.map(f => ({ label: `${basename(f.path)} (${f.type})`, tokens: f.tokens }))),
    mcp: top([...servers].map(([label, tokens]) => ({ label, tokens }))),
    skills: top((b.skills?.skillFrontmatter ?? []).map(s => ({ label: s.name, tokens: s.tokens }))),
    agents: top(b.agents.map(a => ({ label: a.agentType, tokens: a.tokens }))),
  }
}

/**
 * Cells per segment for a bar `width` wide, by largest remainder. Every
 * non-empty used segment gets at least one cell, taken from free space.
 */
export const layoutBar = (segments: Segment[], max: number, width: number): number[] => {
  const sum = segments.reduce((n, s) => n + s.tokens, 0)
  const scale = Math.max(max, sum, 1)
  const exact = segments.map(s => (s.tokens / scale) * width)
  const cells = exact.map(Math.floor)
  let left = width - cells.reduce((n, c) => n + c, 0)
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    cells[i] = (cells[i] ?? 0) + 1
    left -= 1
  }

  segments.forEach((s, i) => {
    if (s.kind !== 'used' || s.tokens <= 0 || (cells[i] ?? 0) > 0) return
    const donor = segments.findIndex((d, j) => d.kind === 'free' && (cells[j] ?? 0) > 1)
    if (donor < 0) return
    cells[donor] = (cells[donor] ?? 0) - 1
    cells[i] = 1
  })

  return cells
}

export const colorOf = (segments: Segment[], i: number): string | undefined => {
  const s = segments[i]
  if (!s || s.kind !== 'used') return undefined
  const used = segments.slice(0, i).filter(x => x.kind === 'used').length
  return PALETTE[used % PALETTE.length]
}

const GLYPH = { used: '█', free: '░', buffer: '▒', deferred: ' ' } as const

/** `$.agent.list()`'s row as plain data, the fields the Tasks tree draws. */
export const toAgent = (info: AgentInfo): Agent => {
  const agent: Agent = { id: info.id, description: info.description, type: info.type, status: info.status }
  if (info.parentId) agent.parentId = info.parentId
  return agent
}

const isActive = (status: string) => status === 'running' || status === 'pending' || status === 'idle'

/**
 * Every agent once, depth first, each under the agent that spawned it, in spawn order,
 * with the connectors each row draws. A `folded` id keeps its row and hides its descendants.
 */
export const buildTree = (list: Agent[], folded: ReadonlySet<string> = new Set()): TreeRow[] => {
  const ids = new Set(list.map(a => a.id))
  const children = new Map<string, Agent[]>()
  const roots: Agent[] = []
  for (const agent of list) {
    // A parent the list doesn't name puts the agent at the top rather than hiding it.
    if (agent.parentId && agent.parentId !== agent.id && ids.has(agent.parentId)) {
      children.set(agent.parentId, [...(children.get(agent.parentId) ?? []), agent])
    } else {
      roots.push(agent)
    }
  }
  // Claim each agent once (it has one parent), so a parent cycle can't loop.
  const kids = new Map<string, Agent[]>()
  const claimed = new Set<string>()
  const claim = (agent: Agent) => {
    claimed.add(agent.id)
    const mine = (children.get(agent.id) ?? []).filter(c => !claimed.has(c.id))
    kids.set(agent.id, mine)
    for (const c of mine) claim(c)
  }
  const tops: Agent[] = []
  // Roots first; then a parent cycle, which has no root, still shows every agent.
  for (const agent of [...roots, ...list]) {
    if (claimed.has(agent.id)) continue
    tops.push(agent)
    claim(agent)
  }

  const counts = new Map<string, { descendants: number; running: number }>()
  const count = (agent: Agent): { descendants: number; running: number } => {
    let descendants = 0
    let running = 0
    for (const c of kids.get(agent.id) ?? []) {
      const sub = count(c)
      descendants += 1 + sub.descendants
      running += (isActive(c.status) ? 1 : 0) + sub.running
    }
    const n = { descendants, running }
    counts.set(agent.id, n)
    return n
  }
  for (const t of tops) count(t)

  const rows: TreeRow[] = []
  const walk = (agent: Agent, depth: number, last: boolean, guides: boolean[]) => {
    const n = counts.get(agent.id) ?? { descendants: 0, running: 0 }
    const fold = folded.has(agent.id) && n.descendants > 0
    rows.push({ agent, depth, last, guides, descendants: n.descendants, running: n.running, folded: fold })
    if (fold) return
    const mine = kids.get(agent.id) ?? []
    // A root's children start the connectors; deeper ones carry a guide for this row's later siblings.
    const next = depth === 0 ? [] : [...guides, !last]
    mine.forEach((c, i) => walk(c, depth + 1, i === mine.length - 1, next))
  }
  tops.forEach((t, i) => walk(t, 0, i === tops.length - 1, []))
  return rows
}

/**
 * The tree cut to `budget` rows: finished subtrees fold into their parent first, the
 * topmost (oldest) first, so running agents and their ancestors stay; the rest is cut.
 */
export const fitTree = (list: Agent[], budget: number): { rows: TreeRow[]; hidden: number } => {
  const folded = new Set<string>()
  let rows = buildTree(list)
  while (rows.length > budget) {
    // The topmost row whose whole subtree is finished and still shown.
    const next = rows.find(r => r.descendants > 0 && r.running === 0 && !r.folded && !folded.has(r.agent.id))
    if (!next) break
    folded.add(next.agent.id)
    rows = buildTree(list, folded)
  }
  if (rows.length <= budget) return { rows, hidden: 0 }
  const shown = rows.slice(0, Math.max(0, budget - 1))
  return { rows: shown, hidden: rows.length - shown.length }
}

/** The connector before a row's status marker: `│ ` guides, then `├─`/`└─`. */
export const connectorOf = (row: TreeRow): string =>
  row.depth === 0 ? '' : `${row.guides.map(g => (g ? '│ ' : '  ')).join('')}${row.last ? '└─' : '├─'}`

/** The rolled-up children of a parent row, e.g. `3 sub · 1 running`. */
export const subSummary = (row: TreeRow): string => {
  if (row.descendants === 0) return ''
  const parts = [`${row.descendants} sub`]
  if (row.running > 0) parts.push(`${row.running} running`)
  if (row.folded) parts.push('folded')
  return parts.join(' · ')
}

const usageTokens = (u: ModelUsage) =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

export const formatDuration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1_000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** The status as a marker and a color. */
export const statusOf = (status: string): { glyph: string; color: string } => {
  switch (status) {
    case 'running':
    case 'pending':
      return { glyph: '●', color: 'warning' }
    case 'completed':
      return { glyph: '✓', color: 'success' }
    case 'failed':
      return { glyph: '✗', color: 'error' }
    case 'killed':
      return { glyph: '■', color: 'inactive' }
    default:
      return { glyph: '?', color: 'inactive' }
  }
}

/** The dim detail after an agent's description: type, tokens, elapsed. */
export const agentDetail = (agent: Agent, x: AgentExtra | undefined, at: number): string => {
  const parts = [agent.type]
  if (x?.tokens !== undefined) parts.push(`${formatTokens(x.tokens)} tok`)
  if (agent.status === 'running' && x?.startedAt !== undefined) parts.push(formatDuration(at - x.startedAt))
  else if (x?.durationMs !== undefined) parts.push(formatDuration(x.durationMs))
  else if (agent.status !== 'running' && agent.status !== 'pending') parts.push(agent.status)
  return parts.join(' · ')
}

// ---- Git section ---------------------------------------------------------

const git = atom({ plugin: 'overview', key: 'git' } as const, null)
const gh = atom({ plugin: 'overview', key: 'gh' } as const, null)
const GIT_MS = 5_000
const GH_MS = 30_000
const GIT_FILES = 4
const GIT_PRS = 3

export const C = {
  ok: '#9ece6a',
  bad: '#f7768e',
  warn: '#e0af68',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  cyan: '#7dcfff',
} as const

type Parsed = Omit<GitInfo, 'ok' | 'root' | 'repo' | 'worktree' | 'insertions' | 'deletions'>

const fileOf = (xy: string, path: string, renamed = false): GitFile => {
  const x = xy[0] ?? '.'
  const y = xy[1] ?? '.'
  const kind: GitFile['kind'] = renamed
    ? 'renamed'
    : x === 'A'
      ? 'added'
      : x === 'D' || y === 'D'
        ? 'deleted'
        : 'modified'
  return { path, kind, staged: x !== '.' && y === '.' }
}

/** `git status --porcelain=v2 --branch`, counted and listed. */
export const parseStatus = (text: string): Parsed => {
  const out: Parsed = {
    branch: '',
    detached: false,
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    files: [],
    fileCount: 0,
  }
  let oid = ''
  for (const line of text.split('\n')) {
    if (!line) continue
    const parts = line.split(' ')
    if (line.startsWith('# branch.oid ')) oid = parts[2] ?? ''
    else if (line.startsWith('# branch.head ')) out.branch = parts.slice(2).join(' ')
    else if (line.startsWith('# branch.upstream ')) out.upstream = parts.slice(2).join(' ')
    else if (line.startsWith('# branch.ab ')) {
      out.ahead = Math.abs(Number(parts[2]) || 0)
      out.behind = Math.abs(Number(parts[3]) || 0)
    } else if (parts[0] === '1' || parts[0] === '2') {
      const xy = parts[1] ?? '..'
      if (xy[0] !== '.') out.staged++
      if (xy[1] !== '.') out.modified++
      const path = parts[0] === '1' ? parts.slice(8).join(' ') : (parts.slice(9).join(' ').split('\t')[0] ?? '')
      out.files.push(fileOf(xy, path, parts[0] === '2'))
    } else if (parts[0] === 'u') {
      out.conflicted++
      out.files.push({ path: parts.slice(10).join(' '), kind: 'conflict', staged: false })
    } else if (parts[0] === '?') {
      out.untracked++
      out.files.push({ path: parts.slice(1).join(' '), kind: 'untracked', staged: false })
    }
  }
  if (out.branch === '(detached)' || !out.branch) {
    out.detached = true
    out.branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : 'detached'
  }
  // Conflicts first, then tracked changes, then untracked.
  const rank = { conflict: 0, added: 1, deleted: 1, renamed: 1, modified: 1, untracked: 2 }
  out.fileCount = out.files.length
  out.files = [...out.files].sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, GIT_FILES)
  return out
}

/** `git worktree list --porcelain`: each worktree's path, the main checkout first. */
export const parseWorktrees = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map(block => block.split('\n').find(l => l.startsWith('worktree '))?.slice('worktree '.length) ?? '')
    .filter(Boolean)

/** `git diff --shortstat`: insertions and deletions. */
export const parseShortstat = (text: string) => ({
  insertions: Number(/(\d+) insertion/.exec(text)?.[1] ?? 0),
  deletions: Number(/(\d+) deletion/.exec(text)?.[1] ?? 0),
})

type RollupItem = { name?: string; context?: string; status?: string; conclusion?: string; state?: string }

/** Check runs and commit statuses, counted as GitHub's PR page counts them. */
export const summarizeChecks = (rollup: RollupItem[] | null | undefined) => {
  const checks = { passed: 0, failed: 0, pending: 0 }
  const failing: string[] = []
  for (const c of rollup ?? []) {
    const outcome = (c.conclusion || c.state || '').toUpperCase()
    if (c.status !== undefined && c.status !== 'COMPLETED') checks.pending++
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(outcome)) checks.passed++
    else if (['PENDING', 'EXPECTED', ''].includes(outcome)) checks.pending++
    else {
      checks.failed++
      const name = c.name || c.context
      if (name && !failing.includes(name)) failing.push(name)
    }
  }
  return { checks, failing }
}

export const toGitPr = (json: any, branch: string): GitPr => ({
  number: Number(json.number),
  title: String(json.title ?? ''),
  url: String(json.url ?? ''),
  state: String(json.state ?? 'OPEN'),
  isDraft: Boolean(json.isDraft),
  review: String(json.reviewDecision ?? ''),
  ...summarizeChecks(json.statusCheckRollup),
  current: json.headRefName === branch,
})

/** A one-line reason from gh's stderr. */
export const ghNote = (stderr: string): string => {
  if (/auth login|not logged|authenticat/i.test(stderr)) return 'gh not authenticated (run gh auth login)'
  if (/no git remote|none of the git remotes|not a git/i.test(stderr)) return 'No GitHub remote for this repo'
  return (stderr.trim().split('\n')[0] || 'gh failed').slice(0, 120)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const loadGit = async ($: EngineInterface): Promise<GitInfo | GitNote> => {
  const cwd = await $.session.cwd()
  // --no-optional-locks: a read never rewrites the index.
  const run = (args: string[]) => $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 10_000 })
  let top: ProcessRunResult
  try {
    top = await run(['rev-parse', '--show-toplevel'])
  } catch {
    return { ok: false, note: 'git not found' }
  }
  if (top.exitCode !== 0) return { ok: false, note: 'Not a git repository' }
  const root = top.stdout.trim()
  const [status, wt, diff] = await Promise.all([
    run(['status', '--porcelain=v2', '--branch']).catch(() => null),
    run(['worktree', 'list', '--porcelain']).catch(() => null),
    run(['diff', '--shortstat', 'HEAD']).catch(() => null),
  ])
  if (!status || status.exitCode !== 0) {
    return { ok: false, note: (status?.stderr || 'git status failed').trim().split('\n')[0] ?? 'git status failed' }
  }
  const trees = wt && wt.exitCode === 0 ? parseWorktrees(wt.stdout) : []
  const main = trees[0] ?? root
  return {
    ok: true,
    root,
    repo: basename(main).replace(/\.git$/, ''),
    ...parseStatus(status.stdout),
    worktree: { name: basename(root), path: root, linked: trees.length > 0 && root !== main, count: trees.length },
    ...(diff && diff.exitCode === 0 ? parseShortstat(diff.stdout) : { insertions: 0, deletions: 0 }),
  }
}

const GH_FIELDS = 'number,title,state,isDraft,reviewDecision,statusCheckRollup,url,headRefName'

const loadGh = async ($: EngineInterface, info: GitInfo): Promise<GhInfo> => {
  const at = Date.now()
  const run = (args: string[]) => $.process.run(['gh', ...args], { cwd: info.root, timeoutMs: 20_000 })
  let list: ProcessRunResult
  let here: ProcessRunResult | null
  try {
    ;[list, here] = await Promise.all([
      run(['pr', 'list', '--author', '@me', '--state', 'open', '--limit', '5', '--json', GH_FIELDS]),
      // The current branch's PR, whoever opened it; exits 1 when there is none.
      info.detached ? Promise.resolve(null) : run(['pr', 'view', '--json', GH_FIELDS]),
    ])
  } catch {
    return { root: info.root, prs: [], note: 'gh not installed', at }
  }
  if (list.exitCode !== 0) return { root: info.root, prs: [], note: ghNote(list.stderr), at }
  const prs: GitPr[] = []
  try {
    if (here && here.exitCode === 0) prs.push({ ...toGitPr(JSON.parse(here.stdout), info.branch), current: true })
    for (const json of JSON.parse(list.stdout) as any[]) {
      if (!prs.some(p => p.number === json.number)) prs.push(toGitPr(json, info.branch))
    }
  } catch {
    return { root: info.root, prs: [], note: 'Could not read gh output', at }
  }
  prs.sort((a, b) => Number(b.current) - Number(a.current) || b.number - a.number)
  return { root: info.root, prs, at }
}

let gitBusy = false
let gitAgain = false
let ghBusy = false
let gitTimer: Timer | undefined
let ghTimer: Timer | undefined

/** Re-read git; a call made while one runs queues one more run after it. */
const refreshGit = async ($: EngineInterface): Promise<void> => {
  if (gitBusy) {
    gitAgain = true
    return
  }
  gitBusy = true
  try {
    do {
      gitAgain = false
      const fresh = await loadGit($)
      if (!same(await read($, git), fresh)) await update($, git, () => fresh)
      const cached = await read($, gh)
      // A new repo (the session cd'd) shouldn't show the old repo's PRs.
      if (fresh.ok && cached?.root !== fresh.root) void refreshGh($).catch(() => undefined)
    } while (gitAgain)
  } finally {
    gitBusy = false
  }
}

const refreshGh = async ($: EngineInterface): Promise<void> => {
  if (ghBusy) return
  const info = await read($, git)
  if (!info?.ok) return
  ghBusy = true
  try {
    const fresh = await loadGh($, info)
    const before = await read($, gh)
    // Keep the old timestamp when nothing changed, so the pane doesn't redraw for nothing.
    if (!before || !same({ ...before, at: 0 }, { ...fresh, at: 0 })) await update($, gh, () => fresh)
  } finally {
    ghBusy = false
  }
}

const startGitTimers = ($: EngineInterface) => {
  gitTimer?.cancel()
  ghTimer?.cancel()
  gitTimer = $.clock.every(GIT_MS, () => void refreshGit($).catch(() => undefined))
  ghTimer = $.clock.every(GH_MS, () => void refreshGh($).catch(() => undefined))
}

const FILE_TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']

export const fileGlyph = (f: GitFile): { glyph: string; color?: string } => {
  switch (f.kind) {
    case 'conflict':
      return { glyph: '✗', color: C.bad }
    case 'untracked':
      return { glyph: '?', color: C.cyan }
    case 'added':
      return { glyph: '✚', color: C.ok }
    case 'deleted':
      return { glyph: '−', color: C.bad }
    case 'renamed':
      return { glyph: '→', color: C.blue }
    default:
      return { glyph: '●', color: f.staged ? C.ok : C.warn }
  }
}

/** The PR's state as a glyph and color: merged purple, draft dim, open blue. */
export const prGlyph = (pr: GitPr): { glyph: string; color?: string } => {
  if (pr.state === 'MERGED') return { glyph: '⚑', color: C.purple }
  if (pr.state === 'CLOSED') return { glyph: '⚑' }
  if (pr.isDraft) return { glyph: '◌' }
  return { glyph: '⚑', color: C.blue }
}

// ---- Account limits --------------------------------------------------------

const limits = atom({ plugin: 'overview', key: 'limits' } as const, null)

const KNOWN_WINDOWS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend' }

const prettify = (s: string) => {
  const t = s.replace(/[_-]+/g, ' ').trim()
  return t ? t[0]!.toUpperCase() + t.slice(1) : s
}

/** A window's name for people: `five_hour` -> 5-hour, `seven_day_opus` -> Weekly opus. */
export const limitLabel = (kind: string): string => {
  const known = KNOWN_WINDOWS[kind]
  if (known) return known
  for (const [prefix, label] of Object.entries(KNOWN_WINDOWS)) {
    if (kind.startsWith(`${prefix}_`)) return `${label} ${kind.slice(prefix.length + 1).replace(/[_-]+/g, ' ')}`
  }
  return prettify(kind)
}

export const toLimits = (list: SessionRateLimit[]): Limit[] =>
  list.map(l => ({ kind: l.kind, percent: l.percentUsed, ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}) }))

/** Green under 75%, amber from 75%, red from 90%. */
export const limitColor = (percent: number): string => (percent >= 90 ? C.bad : percent >= 75 ? C.warn : C.ok)

/** "resets in 2h 14m", "resets in 3d 4h", or "" when the time is unknown. */
export const resetIn = (resetsAt: string | undefined, at: number): string => {
  if (!resetsAt) return ''
  const t = Date.parse(resetsAt)
  if (Number.isNaN(t)) return ''
  const m = Math.ceil((t - at) / 60_000)
  if (m <= 0) return 'resets now'
  const d = Math.floor(m / 1_440)
  const h = Math.floor((m % 1_440) / 60)
  if (d > 0) return `resets in ${d}d ${h}h`
  if (h > 0) return `resets in ${h}h ${m % 60}m`
  return `resets in ${m}m`
}

const storeLimits = async ($: EngineInterface, list: SessionRateLimit[]) => {
  const fresh = toLimits(list)
  if (!same(await read($, limits), fresh)) await update($, limits, () => fresh)
}

// Ticks once a second while any agent runs, so elapsed times move; stopped when none do.
let ticker: Timer | undefined

const refreshAgents = async ($: EngineInterface): Promise<void> => {
  const extras = await read($, agentExtra)
  const fresh = (await $.agent.list()).map(info => {
    const agent = toAgent(info)
    // The list should name the spawning agent; the spawn hook's parentAgentId backs it up.
    const parentId = extras[agent.id]?.parentId
    if (!agent.parentId && parentId) agent.parentId = parentId
    return agent
  })
  const before = await read($, agents)
  if (JSON.stringify(before) !== JSON.stringify(fresh)) await update($, agents, () => fresh)
  const running = fresh.some(a => a.status === 'running' || a.status === 'pending')
  if (running) {
    await update($, now, () => Date.now())
    ticker ??= $.clock.every(TICK_MS, () => void refreshAgents($).catch(() => undefined))
  } else if (ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

// ---- Session activity --------------------------------------------------------

const activity = atom({ plugin: 'overview', key: 'activity' } as const, {
  turns: 0,
  tools: {},
  files: [],
  turnLog: [],
  contextLog: [],
})
const TURN_LOG = 40
const CONTEXT_LOG = 60
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The path an editing tool's arguments name, if any. */
export const editedPath = (tool: string, args: { file_path?: unknown; notebook_path?: unknown }): string | undefined => {
  if (!EDIT_TOOLS.includes(tool)) return undefined
  const path = args.file_path ?? args.notebook_path
  return typeof path === 'string' && path ? path : undefined
}

/** The activity with one more tool call. */
export const countTool = (a: Activity, tool: string, isError: boolean, path?: string): Activity => {
  const old = a.tools[tool] ?? { n: 0, err: 0 }
  const tools = { ...a.tools, [tool]: { n: old.n + 1, err: old.err + (isError ? 1 : 0) } }
  const files = path && !a.files.includes(path) ? [...a.files, path] : a.files
  return { ...a, tools, files }
}

/** The activity with one more main-loop turn, the log cut to its last TURN_LOG. */
export const countTurn = (a: Activity, ms: number, usage: ModelUsage | undefined): Activity => {
  const point: TurnPoint = {
    ms,
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
  }
  return { ...a, turns: a.turns + 1, turnLog: [...a.turnLog, point].slice(-TURN_LOG) }
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const b = usage.context.breakdown
  if (b) await update($, snapshot, () => toSnapshot(b))
  await storeLimits($, usage.rateLimits ?? [])
  const percent = b?.percentage ?? usage.context.percent
  await update($, activity, a => {
    const log =
      percent === undefined || a.contextLog.at(-1) === percent ? a.contextLog : [...a.contextLog, percent].slice(-CONTEXT_LOG)
    const next: Activity = { ...a, startedAt: usage.startedAt, contextLog: log }
    if (usage.cost) next.cost = usage.cost.usd
    return same(a, next) ? a : next
  })
}

let sessionClock: Timer | undefined

const HELPERS: Helpers = { colorOf, limitLabel, resetIn, buildTree }

/** The app mode's sections the person folded; kept for the session. */
const collapsed = atom({ plugin: 'overview', key: 'collapsed' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'overview',
      description: 'Open the session overview pane: context, cost, turns, tools, agents, limits and git',
    })
    void refresh($).catch(() => undefined)
    void refreshAgents($).catch(() => undefined)
    void refreshGit($).catch(() => undefined)
    startGitTimers($)
    // The session's elapsed time moves even when nothing else does.
    sessionClock?.cancel()
    sessionClock = $.clock.every(30_000, () => void update($, now, () => Date.now()).catch(() => undefined))
    void $.ui.open({ id: PANE, title: 'Overview' })

    return next(e)
  })

  // A tool that may have changed files (or pushed, or opened a PR) re-reads git;
  // a gh or push command re-reads the PRs too.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!('deny' in ran && ran.deny)) {
      const path = editedPath(e.tool, e as { file_path?: unknown; notebook_path?: unknown })
      await update($, activity, a => countTool(a, e.tool, Boolean(ran.isError), path))
    }
    if (FILE_TOOLS.includes(e.tool)) {
      void refreshGit($).catch(() => undefined)
      if (e.tool === 'Bash' && /\bgh pr\b|\bgit (push|commit|checkout|switch)\b/.test(e.command)) {
        void refreshGh($).catch(() => undefined)
      }
    }
    return ran
  })

  // The list has no start time; the spawn does, and the loop it happened in.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId
    if (id) {
      const parentId = e.parentAgentId
      await update($, agentExtra, all => {
        const x: AgentExtra = { ...all[id], startedAt: Date.now() }
        if (parentId && parentId !== id) x.parentId = parentId
        return { ...all, [id]: x }
      })
      await refreshAgents($).catch(() => undefined)
    }
    return started
  })

  // Each run of a subagent's loop is one turn; its end carries duration and usage.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refreshGit($).catch(() => undefined)
    const id = e.agentId
    if (id) {
      await update($, agentExtra, all => {
        const old = all[id] ?? {}
        const x: AgentExtra = { ...old, durationMs: (old.durationMs ?? 0) + e.durationMs }
        if (e.usage) x.tokens = (old.tokens ?? 0) + usageTokens(e.usage)
        return { ...all, [id]: x }
      })
      void refreshAgents($).catch(() => undefined)
    } else {
      await update($, activity, a => countTurn(a, e.durationMs, e.usage))
    }
    return done
  })

  on('command.run', { command: 'overview' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Overview' })

    return { text: 'Overview pane opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) await storeLimits($, e.rateLimits)
    await refresh($)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, snapshot)
    const list = await read($, agents)
    const extras = await read($, agentExtra)
    const at = (await read($, now)) || Date.now()
    const repo = await read($, git)
    const hub = await read($, gh)

    // The app surfaces draw it their own way: no cells to count, real charts.
    if (e.surface !== 'terminal') {
      const data = {
        snap,
        limits: await read($, limits),
        agents: list,
        extras,
        git: repo,
        gh: hub,
        activity: await read($, activity),
        collapsed: await read($, collapsed),
        toggle: (id: string) =>
          void update($, collapsed, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])).catch(() => undefined),
        columns: e.props.bodyColumns,
        at: Date.now(),
      }
      return renderDesktop($.ui.resolve(e) as AppElements, data, HELPERS)
    }
    const { Box, Text } = $.ui.resolve(e)
    const docked = e.props.placement === 'dock'
    const bodyRows = e.props.scroll?.bodyRows ?? 0

    // ---- the git section, one element per row ----
    const gitLines: RenderElement[] = []
    const sep = <Text dimColor>{' · '}</Text>
    if (repo === null) {
      gitLines.push(<Text dimColor>Reading git…</Text>)
    } else if (!repo.ok) {
      gitLines.push(<Text dimColor wrap="truncate">{`⎇ ${repo.note}`}</Text>)
    } else {
      const g = repo
      gitLines.push(
        <Text wrap="truncate">
          <Text color={C.blue} bold>{`⎇ ${g.branch}`}</Text>
          {g.detached ? <Text color={C.warn}>{' (detached)'}</Text> : null}
          {g.ahead ? <Text color={C.ok}>{` ↑${g.ahead}`}</Text> : null}
          {g.behind ? <Text color={C.warn}>{` ↓${g.behind}`}</Text> : null}
          {!g.upstream && !g.detached ? <Text dimColor>{' ◌ no upstream'}</Text> : null}
          {g.upstream && !g.ahead && !g.behind ? <Text color={C.ok}>{' ✓'}</Text> : null}
          {sep}
          <Text dimColor>{g.repo}</Text>
        </Text>,
      )
      gitLines.push(
        g.worktree.linked ? (
          <Text wrap="truncate">
            <Text color={C.purple}>{`⑂ worktree ${g.worktree.name}`}</Text>
            <Text dimColor>{` (linked, ${g.worktree.count} total) ${g.worktree.path}`}</Text>
          </Text>
        ) : (
          <Text dimColor wrap="truncate">
            {`▣ main checkout${g.worktree.count > 1 ? ` (+${g.worktree.count - 1} worktrees)` : ''} ${g.worktree.path}`}
          </Text>
        ),
      )
      const counts: RenderElement[] = []
      if (g.conflicted) counts.push(<Text color={C.bad}>{`✗ ${g.conflicted} conflicted  `}</Text>)
      if (g.staged) counts.push(<Text color={C.ok}>{`✚ ${g.staged} staged  `}</Text>)
      if (g.modified) counts.push(<Text color={C.warn}>{`● ${g.modified} modified  `}</Text>)
      if (g.untracked) counts.push(<Text color={C.cyan}>{`? ${g.untracked} untracked  `}</Text>)
      if (g.insertions) counts.push(<Text color={C.ok}>{`+${g.insertions} `}</Text>)
      if (g.deletions) counts.push(<Text color={C.bad}>{`−${g.deletions}`}</Text>)
      gitLines.push(
        counts.length === 0 ? (
          <Text color={C.ok}>✓ working tree clean</Text>
        ) : (
          <Text wrap="truncate">{counts}</Text>
        ),
      )
      for (const f of g.files) {
        const s = fileGlyph(f)
        gitLines.push(
          <Text wrap="truncate-start">
            <Text color={s.color}>{`  ${s.glyph} `}</Text>
            {f.path}
          </Text>,
        )
      }
      if (g.fileCount > g.files.length) gitLines.push(<Text dimColor>{`  … ${g.fileCount - g.files.length} more`}</Text>)

      // ---- pull requests ----
      if (hub === null || hub.root !== g.root) {
        gitLines.push(<Text dimColor>⟳ Reading pull requests…</Text>)
      } else if (hub.note) {
        gitLines.push(<Text dimColor wrap="truncate">{`⚑ ${hub.note}`}</Text>)
      } else if (hub.prs.length === 0) {
        gitLines.push(<Text dimColor>⚑ No open pull requests</Text>)
      } else {
        for (const pr of hub.prs.slice(0, GIT_PRS)) {
          const p = prGlyph(pr)
          gitLines.push(
            <Text wrap="truncate">
              <Text color={p.color} dimColor={!p.color} bold={pr.current}>{`${p.glyph} #${pr.number} `}</Text>
              <Text dimColor={pr.state !== 'OPEN' || pr.isDraft}>{pr.title}</Text>
            </Text>,
          )
          const bits: RenderElement[] = []
          if (pr.state === 'MERGED') bits.push(<Text color={C.purple}>merged</Text>)
          else if (pr.state === 'CLOSED') bits.push(<Text dimColor>closed</Text>)
          else {
            if (pr.isDraft) bits.push(<Text dimColor>◌ draft</Text>)
            const { passed, failed, pending } = pr.checks
            if (failed) {
              bits.push(
                <Text color={C.bad}>{`✗ ${failed} failing${pr.failing.length ? `: ${pr.failing.slice(0, 3).join(', ')}` : ''}`}</Text>,
              )
            }
            if (pending) bits.push(<Text color={C.warn}>{`⟳ ${pending} pending`}</Text>)
            if (passed && !failed && !pending) bits.push(<Text color={C.ok}>✓ checks pass</Text>)
            if (!passed && !failed && !pending) bits.push(<Text dimColor>no checks</Text>)
            if (pr.review === 'APPROVED') bits.push(<Text color={C.ok}>✓ approved</Text>)
            else if (pr.review === 'CHANGES_REQUESTED') bits.push(<Text color={C.bad}>✗ changes requested</Text>)
            else if (pr.review === 'REVIEW_REQUIRED') bits.push(<Text color={C.warn}>◌ review required</Text>)
          }
          if (pr.current) bits.push(<Text color={C.blue}>⎇ this branch</Text>)
          gitLines.push(
            <Text wrap="truncate">
              {'  '}
              {bits.flatMap((b, i) => (i === 0 ? [b] : [sep, b]))}
            </Text>,
          )
        }
        if (hub.prs.length > GIT_PRS) gitLines.push(<Text dimColor>{`  … ${hub.prs.length - GIT_PRS} more PRs`}</Text>)
      }
    }
    const gitSection = (
      <Box flexDirection="column" marginTop={1} flexShrink={0}>
        {gitLines}
      </Box>
    )
    const gitRows = gitLines.length + 1

    // ---- account limits, between the context rows and the tasks ----
    const windows = (await read($, limits)) ?? []
    const paneColumns = Math.max(20, e.props.bodyColumns)
    const drawnAt = Date.now()
    const labelWidth = Math.min(16, Math.max(7, ...windows.map(w => limitLabel(w.kind).length)) + 1)
    const resetTexts = windows.map(w => resetIn(w.resetsAt, drawnAt))
    const resetWidth = Math.max(0, ...resetTexts.map(t => t.length))
    // glyph (2), label, bar, percent (5), the reset text
    const limitBar = Math.max(4, Math.min(30, paneColumns - 2 - labelWidth - 5 - (resetWidth ? resetWidth + 2 : 0)))
    const limitLines: RenderElement[] =
      windows.length === 0
        ? [<Text dimColor>No limits reported yet.</Text>]
        : windows.map((w, i) => {
            const color = limitColor(w.percent)
            const filled = Math.min(limitBar, Math.round((Math.min(100, Math.max(0, w.percent)) / 100) * limitBar))
            const pct = `${Math.round(w.percent)}%`.padStart(5)
            return (
              <Box flexDirection="row">
                <Text color={color}>■ </Text>
                <Box width={labelWidth} flexShrink={0}>
                  <Text wrap="truncate">{limitLabel(w.kind)}</Text>
                </Box>
                <Text color={color}>{'█'.repeat(filled)}</Text>
                <Text dimColor>{'░'.repeat(limitBar - filled)}</Text>
                <Text color={color} bold>
                  {pct}
                </Text>
                {resetTexts[i] ? (
                  <Text dimColor wrap="truncate">{`  ${resetTexts[i]}`}</Text>
                ) : null}
              </Box>
            )
          })
    const limitsSection = (
      <Box flexDirection="column" marginTop={1} flexShrink={0}>
        <Text bold>Account limits</Text>
        {limitLines}
      </Box>
    )
    const limitRows = limitLines.length + 2

    // ---- tasks, cut to the rows the git section leaves ----
    const tasksFor = (budget: number) => {
      // budget: rows for the tree itself, under the margin and the heading.
      if (budget < 1) return null
      const { rows: shown, hidden } = fitTree(list, budget)
      return (
        <Box flexDirection="column" marginTop={1} flexShrink={1} overflow="hidden">
          <Text bold>Tasks</Text>
          {list.length === 0 ? (
            <Text dimColor>No subagents yet.</Text>
          ) : (
            shown.map(row => {
              const { agent } = row
              const s = statusOf(agent.status)
              const connector = connectorOf(row)
              const sub = subSummary(row)
              return (
                <Box key={agent.id} flexDirection="row">
                  {connector ? <Text dimColor>{connector}</Text> : null}
                  <Text color={s.color}>{`${s.glyph} `}</Text>
                  <Text wrap="truncate">
                    {agent.description || agent.type}
                    <Text dimColor>{`  ${agentDetail(agent, extras[agent.id], at)}`}</Text>
                    {sub ? <Text dimColor>{`  ${sub}`}</Text> : null}
                  </Text>
                </Box>
              )
            })
          )}
          {hidden > 0 ? <Text dimColor>{`… ${hidden} more tasks`}</Text> : null}
        </Box>
      )
    }

    /** The context content, the account limits, the tasks, then the git section on the last rows when docked. */
    const compose = (head: RenderElement, headRows: number, width?: number) => {
      const budget = docked ? bodyRows - headRows - limitRows - gitRows - 2 : Number.POSITIVE_INFINITY
      const tasks = tasksFor(budget)
      return docked ? (
        <Box flexDirection="column" width={width} height={bodyRows}>
          <Box flexDirection="column" flexShrink={1} overflow="hidden">
            {head}
            {limitsSection}
            {tasks}
          </Box>
          <Box flexGrow={1} flexShrink={1} />
          {gitSection}
        </Box>
      ) : (
        <Box flexDirection="column" width={width}>
          {head}
          {limitsSection}
          {tasks}
          {gitSection}
        </Box>
      )
    }

    if (snap === null) {
      return compose(<Text dimColor>Measuring the context window…</Text>, 1)
    }

    const columns = Math.max(20, e.props.bodyColumns)
    const percentColor = snap.percent >= 90 ? 'error' : snap.percent >= 75 ? 'warning' : 'success'
    const cells = layoutBar(snap.segments, snap.max, columns)
    const rows = snap.segments.filter(s => s.tokens > 0)
    const nameWidth = Math.min(22, Math.max(...rows.map(s => s.name.length)) + 2)
    // name, then tokens (6) and share (5), then a bar of what is left
    const rowBar = Math.max(0, columns - 2 - nameWidth - 12)

    const details: [string, Item[]][] = [
      ['Memory', snap.memory],
      ['MCP', snap.mcp],
      ['Skills', snap.skills],
      ['Agents', snap.agents],
    ]

    const head = (
      <Box flexDirection="column" flexShrink={0}>
        <Box flexDirection="row">
          <Text color={percentColor} bold>
            {`${snap.percent}%`}
          </Text>
          <Text dimColor>{` · ${formatTokens(snap.total)} of ${formatTokens(snap.max)} · ${snap.model}`}</Text>
        </Box>
        <Box flexDirection="row">
          {snap.segments.map((s, i) => {
            const n = cells[i] ?? 0
            if (n === 0) return null
            const color = colorOf(snap.segments, i)
            const glyph = GLYPH[s.kind].repeat(n)

            return color ? <Text color={color}>{glyph}</Text> : <Text dimColor>{glyph}</Text>
          })}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {rows.map(s => {
            const i = snap.segments.indexOf(s)
            const color = colorOf(snap.segments, i)
            const share = (s.tokens / Math.max(snap.max, 1)) * 100
            const n = s.tokens > 0 ? Math.max(1, Math.round((share / 100) * rowBar)) : 0

            return (
              <Box flexDirection="row">
                {color ? <Text color={color}>■ </Text> : <Text dimColor>{`${GLYPH[s.kind]} `}</Text>}
                <Box width={nameWidth}>
                  <Text dimColor={!color} wrap="truncate">
                    {s.name}
                  </Text>
                </Box>
                <Text>{formatTokens(s.tokens).padStart(6)}</Text>
                <Text dimColor>{`${share < 1 ? '<1' : Math.round(share)}%`.padStart(5)} </Text>
                {color ? (
                  <Text color={color}>{'▬'.repeat(Math.min(n, rowBar))}</Text>
                ) : (
                  <Text dimColor>{GLYPH[s.kind].repeat(Math.min(n, rowBar))}</Text>
                )}
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {details.map(([name, items]) =>
            items.length === 0 ? null : (
              <Box flexDirection="row">
                <Box width={8} flexShrink={0}>
                  <Text bold>{name}</Text>
                </Box>
                <Text wrap="truncate">
                  {items.map(it => `${it.label} ${formatTokens(it.tokens)}`).join(' · ')}
                </Text>
              </Box>
            ),
          )}
          <Text dimColor>
            {snap.compactAt ? `Auto-compacts at ${formatTokens(snap.compactAt)}` : 'Auto-compact off'}
          </Text>
        </Box>
      </Box>
    )
    // percent, bar, margin, a row per category, margin, the details, the compaction line
    const headRows = 2 + 1 + rows.length + 1 + details.filter(([, items]) => items.length > 0).length + 1

    return compose(head, headRows, columns)
  })
}
