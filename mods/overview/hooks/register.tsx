import { atom, read, update } from 'claude-code'
import type {
  AgentInfo,
  EngineInterface,
  ModelUsage,
  ProcessRunResult,
  Register,
  SessionContextBreakdown,
  SessionRateLimit,
  Timer,
} from 'claude-code'

import type {
  Activity,
  Agent,
  AgentExtra,
  BranchView,
  Doing,
  DoingKind,
  GhInfo,
  GitFile,
  GitInfo,
  GitNote,
  GitPr,
  Item,
  Limit,
  Segment,
  Snapshot,
  Tracked,
  TreeRow,
  TurnPoint,
  WorkspacesGh,
} from '../types'
import { parseLeftRight, startedBy } from './branches'
import { short } from '@kit/format'
import { createPerf } from '@kit/perf'
import { holdButtons } from '@kit/ui'

import { renderDesktop } from './desktop'
import type { AppElements, DesktopData, Helpers } from './desktop'
import { renderTerminal } from './terminal'
import type { TermElements, TermHelpers } from './terminal'
import { NETTOP, NET_PER_PROCESS, resourcesSh, takeNettop, toResources } from './resources'

const PANE = 'overview'
const snapshot = atom({ plugin: 'overview', key: 'snapshot' } as const, null)
const agents = atom({ plugin: 'overview', key: 'agents' } as const, [])
const agentExtra = atom({ plugin: 'overview', key: 'agentExtra' } as const, {})
const now = atom({ plugin: 'overview', key: 'now' } as const, 0)
const resources = atom({ plugin: 'overview', key: 'resources' } as const, null)
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

export const colorOf = (segments: Segment[], i: number): string | undefined => {
  const s = segments[i]
  if (!s || s.kind !== 'used') return undefined
  const used = segments.slice(0, i).filter(x => x.kind === 'used').length
  return PALETTE[used % PALETTE.length]
}

/** `$.agent.list()`'s row as plain data, the fields the Agents tree draws. */
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

// ---- Git section ---------------------------------------------------------

const git = atom({ plugin: 'overview', key: 'git' } as const, null)
const gh = atom({ plugin: 'overview', key: 'gh' } as const, null)
const GIT_FILES = 4

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
  conflicting: json.mergeable === 'CONFLICTING',
})

/** A one-line reason from gh's stderr. */
export const ghNote = (stderr: string): string => {
  if (/auth login|not logged|authenticat/i.test(stderr)) return 'gh not authenticated (run gh auth login)'
  if (/no git remote|none of the git remotes|not a git/i.test(stderr)) return 'No GitHub remote for this repo'
  return (stderr.trim().split('\n')[0] || 'gh failed').slice(0, 120)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A git read: the repo, or why there's none. `lasting`: the answer itself (not a
 * repo), not a read that failed. `root`: the repo a failed read was for.
 */
type GitRead = GitInfo | (GitNote & { lasting?: boolean; root?: string })

/** When git and gh were last read good: the age a failed refresh shows. */
const goodAt = { git: 0, gh: 0, workspaces: 0 }

/**
 * What the git state becomes after a read: a good read as it is; a failed one
 * keeps the last-good figures of the same repo, marked with why and since when;
 * anything else is its note.
 */
const keepGit =(before: GitInfo | GitNote | null, fresh: GitRead, t: number): GitInfo | GitNote => {
  if (fresh.ok) {
    goodAt.git = t
    return fresh
  }
  if (!fresh.lasting && before?.ok && (fresh.root === undefined || fresh.root === before.root)) {
    return { ...before, failed: fresh.note, at: before.failed ? before.at : goodAt.git || undefined }
  }
  return { ok: false, note: fresh.note }
}

/** The same for gh: a failed read for the same repo keeps the last-good PRs. */
const keepGh =(before: GhInfo | null, fresh: GhInfo): GhInfo => {
  if (!fresh.note) {
    goodAt.gh = fresh.at
    return fresh
  }
  if (before && !before.note && before.root === fresh.root) {
    return { ...before, failed: fresh.note, at: before.failed ? before.at : goodAt.gh || before.at }
  }
  return fresh
}

const loadGit = async ($: EngineInterface): Promise<GitRead> => {
  const cwd = await $.session.cwd()
  // --no-optional-locks: a read never rewrites the index.
  const run = (args: string[]) => $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 10_000 })
  let top: ProcessRunResult
  try {
    top = await run(['rev-parse', '--show-toplevel'])
  } catch {
    return { ok: false, note: 'git not found' }
  }
  if (top.exitCode !== 0) return { ok: false, note: 'Not a git repository', lasting: true }
  const root = top.stdout.trim()
  const [status, wt, diff] = await Promise.all([
    run(['status', '--porcelain=v2', '--branch']).catch(() => null),
    run(['worktree', 'list', '--porcelain']).catch(() => null),
    run(['diff', '--shortstat', 'HEAD']).catch(() => null),
  ])
  if (!status || status.exitCode !== 0) {
    return { ok: false, note: (status?.stderr || 'git status failed').trim().split('\n')[0] || 'git status failed', root }
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

const GH_FIELDS = 'number,title,state,isDraft,reviewDecision,statusCheckRollup,url,headRefName,mergeable'

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
      const before = await read($, git)
      const fresh = keepGit(before, await loadGit($), Date.now())
      if (!same(before, fresh)) await update($, git, () => fresh)
      const cached = await read($, gh)
      // A new repo (the session cd'd) shouldn't show the old repo's PRs.
      if (fresh.ok && cached?.root !== fresh.root) stale.gh = true
    } while (gitAgain)
  } finally {
    gitBusy = false
  }
}

// ---- Branches the session works on ----------------------------------------------

const tracked = atom({ plugin: 'overview', key: 'tracked' } as const, [])
const hidden = atom({ plugin: 'overview', key: 'hidden' } as const, [])
const branches = atom({ plugin: 'overview', key: 'branches' } as const, [])
const creating = atom({ plugin: 'overview', key: 'creating' } as const, null)
const workspacesGh = atom({ plugin: 'overview', key: 'workspacesGh' } as const, null)
const MAX_BRANCHES = 6

/** Adds a branch to the tracked list once; a path relative to `cwd` is resolved. */
const track = async ($: EngineInterface, branch: string, path: string, cwd: string) => {
  const full = path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`
  await update($, tracked, list => (list.some(t => t.branch === branch) ? list : [...list, { branch, path: full, at: Date.now() }]))
}

/** One tracked branch's git state against the default branch. */
const loadBranch = async ($: EngineInterface, t: Tracked, base: string, prs: Map<string, GitPr>, root: string): Promise<BranchView> => {
  // A worktree removed after its PR merged leaves the branch in the repository:
  // read it from the session's checkout then, rather than calling it deleted.
  const probe = await $.process.run(['git', 'rev-parse', '--git-dir'], { cwd: t.path, timeoutMs: 10_000 }).catch(() => null)
  const cwd = probe?.exitCode === 0 ? t.path : root
  const run = (args: string[]) => $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 10_000 }).catch(() => null)
  const [head, exists, lr, committed, status, remote, top] = await Promise.all([
    run(['rev-parse', '--abbrev-ref', 'HEAD']),
    run(['rev-parse', '--verify', '--quiet', `refs/heads/${t.branch}`]),
    run(['rev-list', '--left-right', '--count', `${base}...${t.branch}`]),
    run(['diff', '--shortstat', `${base}...${t.branch}`]),
    run(['status', '--porcelain=v2']),
    run(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${t.branch}`]),
    run(['rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir']),
  ])
  const checkedOut = head?.exitCode === 0 && head.stdout.trim() === t.branch
  const counts = checkedOut && status?.exitCode === 0 ? parseStatus(status.stdout) : null
  // Uncommitted lines count too while the branch is checked out, as the app counts them.
  const working = checkedOut ? await run(['diff', '--shortstat', 'HEAD']) : null
  const lines = parseShortstat(committed?.exitCode === 0 ? committed.stdout : '')
  const extra = parseShortstat(working?.exitCode === 0 ? working.stdout : '')
  // A linked worktree's git dir differs from the repository's common one.
  const [toplevel = t.path, gitDir = '.git', common = '.git'] = top?.exitCode === 0 ? top.stdout.trim().split('\n') : []
  return {
    branch: t.branch,
    path: t.path,
    place: basename(toplevel),
    worktree: gitDir !== common,
    exists: exists?.exitCode === 0,
    checkedOut,
    ...(lr?.exitCode === 0 ? parseLeftRight(lr.stdout) : { ahead: 0, behind: 0 }),
    insertions: lines.insertions + extra.insertions,
    deletions: lines.deletions + extra.deletions,
    staged: counts?.staged ?? 0,
    modified: counts?.modified ?? 0,
    untracked: counts?.untracked ?? 0,
    conflicted: counts?.conflicted ?? 0,
    pushed: remote?.exitCode === 0,
    pr: prs.get(t.branch) ?? null,
  }
}

let branchesBusy = false

/** PRs by head branch, from the last gh read; gh runs on its own slower cadence. */
let prCache = new Map<string, GitPr>()
let baseCache: string | null = null
/** Whether a shown workspace has an open PR, as of the last read: gh is then read more often. */
let openPrs = false

/** Re-reads every shown tracked branch; with `withGh`, all their PRs too, in one gh call. */
const refreshBranches = async ($: EngineInterface, withGh = false): Promise<void> => {
  if (branchesBusy) {
    // A gh read skipped now would otherwise wait out the whole interval: try again soon.
    if (withGh) stale.gh = true
    return
  }
  branchesBusy = true
  try {
    const info = await read($, git)
    if (!info?.ok) return
    const run = (cmd: string[]) => $.process.run(cmd, { cwd: info.root, timeoutMs: 20_000 }).catch(() => null)
    if (baseCache === null) {
      const ref = await run(['git', 'rev-parse', '--abbrev-ref', 'origin/HEAD'])
      baseCache = ref?.exitCode === 0 ? ref.stdout.trim() : 'origin/main'
    }
    // The default branch is what the others merge into, not a workspace of its own
    // (it would offer "Create PR" against itself), even when the session sits on it.
    const base = baseCache.replace(/^origin\//, '')
    // The session's own branch counts as started here.
    if (!info.detached && info.branch !== base) await track($, info.branch, info.root, info.root)
    const off = await read($, hidden)
    const list = (await read($, tracked))
      .filter(t => !off.includes(t.branch) && t.branch !== base)
      .slice(-MAX_BRANCHES)
      .reverse()
    if (withGh) {
      const prList = await run(['gh', 'pr', 'list', '--state', 'all', '--limit', '40', '--json', GH_FIELDS])
      let failed: string | undefined = !prList ? 'gh not installed' : prList.exitCode !== 0 ? ghNote(prList.stderr) : undefined
      if (prList?.exitCode === 0) {
        try {
          // Newest first from gh, so the first PR per branch is its latest.
          const prs = new Map<string, GitPr>()
          for (const json of JSON.parse(prList.stdout) as any[]) if (!prs.has(json.headRefName)) prs.set(json.headRefName, toGitPr(json, json.headRefName))
          prCache = prs
        } catch {
          failed = 'Could not read gh output'
        }
      }
      // A failed read keeps the last PRs (prCache), marked with why and since when.
      const before = await read($, workspacesGh)
      if (!failed) goodAt.workspaces = Date.now()
      const next: WorkspacesGh = failed ? { failed, at: before?.failed ? before.at : goodAt.workspaces } : { at: goodAt.workspaces }
      // A good read after a good read changes nothing drawn: no write, no redraw.
      if (failed ? !same(before, next) : !before || before.failed) await update($, workspacesGh, () => next)
    }
    const loaded = await Promise.all(list.map(t => loadBranch($, t, baseCache!, prCache, info.root)))
    // git and gh took a while: a branch hidden since `off` was read must not come
    // back. `hiding` is checked again inside the write, which retries on a miss.
    openPrs = loaded.some(b => b.pr?.state === 'OPEN')
    const offNow = await read($, hidden)
    const shown = () => loaded.filter(b => !offNow.includes(b.branch) && !hiding.has(b.branch))
    if (!same(await read($, branches), shown())) await update($, branches, shown)
  } finally {
    branchesBusy = false
  }
}

/**
 * Branches hidden in this process, set before any await: a refresh already
 * running read `hidden` before the press, and filters by this when it writes.
 */
const hiding = new Set<string>()

/** The ✕ on a branch: stop showing it. */
const hideBranch = async ($: EngineInterface, branch: string) => {
  hiding.add(branch)
  await update($, hidden, list => (list.includes(branch) ? list : [...list, branch]))
  await update($, branches, list => list.filter(b => b.branch !== branch))
}

/**
 * Create PR, as the desktop app's own button does it: hand it to the session as a
 * prompt, so Claude writes the description, opens the PR and starts watching it
 * (auto-merge and Auto-fix, per the person's instructions). Runs as a turn of its
 * own once the session is idle.
 */
const createPr = async ($: EngineInterface, branch: string) => {
  if (await read($, creating)) return
  const view = (await read($, branches)).find(b => b.branch === branch)
  if (!view) return
  await update($, creating, () => branch)
  try {
    await $.prompt.submit({
      text:
        `Create a pull request for the \`${branch}\` branch (checked out at ${view.path}). ` +
        'Push it if needed, write the title and body from its commits, open it, and start watching it.',
      asUser: true,
    })
  } catch {
    $.ui.toast('Create PR: could not send the request to the session')
  } finally {
    await update($, creating, () => null)
  }
}

const refreshGh = async ($: EngineInterface): Promise<void> => {
  if (ghBusy) return
  const info = await read($, git)
  if (!info?.ok) return
  ghBusy = true
  try {
    const before = await read($, gh)
    const fresh = keepGh(before, await loadGh($, info))
    // Keep the old timestamp when nothing changed, so the pane doesn't redraw for nothing.
    if (!before || !same({ ...before, at: 0 }, { ...fresh, at: 0 })) await update($, gh, () => fresh)
  } finally {
    ghBusy = false
  }
}

const FILE_TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']

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

// The session's folder, read once, so an agent's paths can be drawn relative to it.
let sessionCwd: string | undefined

/** Keeps an agent's latest tool call in words, written only when it changed. */
const noteDoing = async ($: EngineInterface, id: string, tool: string, args: Record<string, unknown>): Promise<void> => {
  sessionCwd ??= await $.session.cwd().catch(() => undefined)
  const doing = describeCall(tool, args, sessionCwd)
  const old = (await read($, agentExtra))[id]?.doing
  if (old && old.kind === doing.kind && old.text === doing.text && old.arg === doing.arg) return
  await update($, agentExtra, all => ({ ...all, [id]: { ...all[id], doing } }))
}

// Ticks once a second while any agent runs, so elapsed times move; stopped when none do.
let ticker: Timer | undefined
/** The running agents' elapsed times as their cards last showed them (`elapsedShown`). */
let lastElapsed = ''

/** Each running agent's elapsed time as its card draws it (`short`, whole minutes) at `t`. */
export const elapsedShown = (list: Agent[], extras: Record<string, AgentExtra>, t: number): string =>
  list
    .filter(a => a.status === 'running' && extras[a.id]?.startedAt !== undefined)
    .map(a => `${a.id} ${short(t - extras[a.id]!.startedAt!)}`)
    .join('\n')

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
    // Elapsed times move only where someone can see them, and redraw only when one
    // drawn would read differently (a card shows whole minutes).
    const t = Date.now()
    const elapsed = elapsedShown(fresh, extras, t)
    if (elapsed !== lastElapsed && (await isShown($))) {
      lastElapsed = elapsed
      await update($, now, () => t)
    }
    ticker ??= $.clock.every(TICK_MS, () => void perf.time('agents', () => refreshAgents($)).catch(() => undefined))
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

/** `path` relative to the session's folder when it's inside it, else as given. */
const relative = (path: string, cwd: string | undefined): string =>
  cwd && path.startsWith(`${cwd.replace(/\/$/, '')}/`) ? path.slice(cwd.replace(/\/$/, '').length + 1) : path

/** A string argument, its first line, trimmed; empty when it isn't one. */
const arg = (v: unknown): string => (typeof v === 'string' ? (v.trim().split('\n')[0] ?? '').trim() : '')

/**
 * A tool call for an agent's "doing now" line: its kind, a name or verb and its
 * argument (`Bash` `bun build.ts`, `Editing` `kit/ui.tsx`, `Searching` `TODO`).
 * Paths are made relative to the session's folder.
 */
export const describeCall = (tool: string, args: Record<string, unknown>, cwd?: string): Doing => {
  const doing = (kind: DoingKind, text: string, v: unknown, isPath = false): Doing => {
    const a = arg(v)
    return a ? { kind, text, arg: isPath ? relative(a, cwd) : a } : { kind, text }
  }
  switch (tool) {
    case 'Bash':
      return doing('bash', 'Bash', args.command)
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return doing('edit', 'Editing', args.file_path ?? args.notebook_path, true)
    case 'Write':
      return doing('edit', 'Writing', args.file_path, true)
    case 'Read':
      return doing('read', 'Reading', args.file_path, true)
    case 'Grep':
      return doing('search', 'Searching', args.pattern)
    case 'Glob':
      return doing('search', 'Finding', args.pattern)
    case 'WebFetch':
      return doing('web', 'Fetching', args.url)
    case 'WebSearch':
      return doing('web', 'Searching the web', args.query)
    case 'Agent':
    case 'Task':
      return doing('agent', 'Starting agent', args.description)
    default:
      // An MCP tool by its own name, its server dim after it: `search_issues` `github`.
      if (tool.startsWith('mcp__')) {
        const [, server, ...name] = tool.split('__')
        return name.length ? { kind: 'mcp', text: name.join('__'), arg: server } : { kind: 'mcp', text: tool }
      }
      return { kind: 'other', text: tool }
  }
}

/** The activity with one more tool call. */
export const countTool = (a: Activity, tool: string, isError: boolean, path?: string): Activity => {
  const old = a.tools[tool] ?? { n: 0, err: 0 }
  const tools = { ...a.tools, [tool]: { n: old.n + 1, err: old.err + (isError ? 1 : 0) } }
  const files = path && !a.files.includes(path) ? [...a.files, path] : a.files
  const turnTools = { ...a.turnTools, [tool]: (a.turnTools?.[tool] ?? 0) + 1 }
  return { ...a, tools, files, callsThisTurn: (a.callsThisTurn ?? 0) + 1, turnTools }
}

/** The activity with one more main-loop turn, the log cut to its last TURN_LOG. */
export const countTurn = (a: Activity, ms: number, usage: ModelUsage | undefined): Activity => {
  const point: TurnPoint = {
    ms,
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    calls: a.callsThisTurn ?? 0,
    tools: a.turnTools ?? {},
  }
  return { ...a, turns: a.turns + 1, callsThisTurn: 0, turnTools: {}, turnLog: [...a.turnLog, point].slice(-TURN_LOG) }
}

export const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const b = usage.context.breakdown
  if (b) {
    const fresh = toSnapshot(b)
    if (!same(await read($, snapshot), fresh)) await update($, snapshot, () => fresh)
  }
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

// ---- When to work ------------------------------------------------------------
// Nothing runs while the pane isn't shown: events only mark what went stale,
// and one timer reads it again, at most so often, while the pane is on screen.

let shownAt = 0
let shown = false

/** Whether the overview pane is the one shown and placed; asked at most every 2 s. */
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

const stale = { usage: true, git: true, gh: true }
const last = { usage: 0, git: 0, gh: 0, clock: 0, resources: 0 }
const RESOURCES_EVERY = 10_000
let nettopBusy = false

/** One sample of the session's share of the machine; see resources.ts. */
const sampleResources = async ($: EngineInterface) => {
  const run = await $.process.run(resourcesSh(), { timeoutMs: 5_000 })
  if (run.exitCode !== 0) return null
  if (NET_PER_PROCESS && !nettopBusy) {
    nettopBusy = true
    $.process
      .run(NETTOP, { timeoutMs: 10_000 })
      .then(r => (r.exitCode === 0 ? takeNettop(r.stdout, Date.now()) : undefined))
      .catch(() => undefined)
      .finally(() => (nettopBusy = false))
  }
  return toResources(run.stdout, Date.now())
}
// Even with nothing marked stale, read again this often while shown.
const EVERY = { usage: 60_000, git: 60_000, gh: 180_000, clock: 60_000 }
// And never more often than this, however much happens.
const AT_MOST = { usage: 3_000, git: 3_000, gh: 20_000 }
let worker: Timer | undefined

// While a workspace has an open PR, GitHub moves it with nothing happening here
// (checks finish, auto-merge lands), so gh is read this often instead.
const GH_WHILE_OPEN = 30_000

export const due = (kind: 'usage' | 'git' | 'gh', t: number) =>
  t - last[kind] >= (stale[kind] ? AT_MOST[kind] : kind === 'gh' && openPrs ? GH_WHILE_OPEN : EVERY[kind])

const tick = async ($: EngineInterface) => {
  if (!(await isShown($))) return
  const t = Date.now()
  if (due('usage', t)) {
    stale.usage = false
    last.usage = t
    await perf.time('usage', () => refresh($))
  }
  if (due('git', t)) {
    stale.git = false
    last.git = t
    await perf.time('git', () => refreshGit($))
    if (!due('gh', t)) await perf.time('branches', () => refreshBranches($))
  }
  if (due('gh', t)) {
    stale.gh = false
    last.gh = t
    await perf.time('gh', () => refreshGh($))
    await perf.time('branches', () => refreshBranches($, true))
  }
  // The session's share of the machine: a few shell commands, every 10 s while shown.
  if (t - last.resources >= RESOURCES_EVERY) {
    last.resources = t
    const res = await perf.time('resources', () => sampleResources($)).catch(() => null)
    if (res && !same(await read($, resources), res)) await update($, resources, () => res)
  }
  // The session's elapsed time moves even when nothing else does.
  if (t - last.clock >= EVERY.clock) {
    last.clock = t
    await update($, now, () => t)
  }
}

const HELPERS: Helpers = { colorOf, limitLabel, resetIn, buildTree }
const TERM_HELPERS: TermHelpers = { limitLabel, resetIn, fitTree, subSummary }

/** What this mod costs, drawn in the pane's debug footer. */
export const perf = createPerf()

/** The app mode's sections the person folded; kept for the session. */
const collapsed = atom({ plugin: 'overview', key: 'collapsed' } as const, [])
/** Whether a wide app pane flows its sections into columns; the footer's switch flips it. */
const columns = atom({ plugin: 'overview', key: 'columns' } as const, true)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'overview',
      description: 'Open the session overview pane: context, cost, turns, tools, agents, limits and git',
    })
    void refreshAgents($).catch(() => undefined)
    worker?.cancel()
    worker = $.clock.every(3_000, () => void perf.time('tick', () => tick($)).catch(() => undefined))
    void $.ui.open({ id: PANE, title: 'Overview' })

    return next(e)
  })

  // A tool that may have changed files (or pushed, or opened a PR) marks git stale;
  // a gh or push command marks the PRs stale too. Nothing waits on the bookkeeping.
  on('tool.call', async ($, e, next) => {
    // A subagent's call, as it starts: what that agent is doing now.
    const agentId = e.agentId
    if (agentId) void noteDoing($, agentId, e.tool, e as unknown as Record<string, unknown>).catch(() => undefined)
    const ran = await next(e)
    if (!('deny' in ran && ran.deny)) {
      const path = editedPath(e.tool, e as { file_path?: unknown; notebook_path?: unknown })
      void perf.time('tool.call', () => update($, activity, a => countTool(a, e.tool, Boolean(ran.isError), path))).catch(() => undefined)
    }
    // A command that starts a branch or a worktree: track it.
    if (e.tool === 'Bash') {
      const started = startedBy(e.command)
      if (started.length) {
        void (async () => {
          const cwd = await $.session.cwd()
          for (const s of started) await track($, s.branch, s.path ?? cwd, cwd)
          stale.gh = true
        })().catch(() => undefined)
      }
    }
    if (FILE_TOOLS.includes(e.tool)) {
      stale.git = true
      if (e.tool === 'Bash' && /\bgh pr\b|\bgit (push|commit|checkout|switch)\b/.test(e.command)) stale.gh = true
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
    stale.git = true
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
      void update($, activity, a => countTurn(a, e.durationMs, e.usage)).catch(() => undefined)
    }
    return done
  })

  on('command.run', { command: 'overview' }, async $ => {
    // Opened by the person: read everything now rather than on the next tick.
    shownAt = 0
    stale.usage = stale.git = stale.gh = true
    last.usage = last.git = last.gh = 0
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Overview' })

    return { text: 'Overview pane opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) await storeLimits($, e.rateLimits)
    // The breakdown is worked out on the next tick, if the pane is shown.
    stale.usage = true

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Read so the pane redraws as elapsed times move.
    await read($, now)
    const data: DesktopData = {
      snap: await read($, snapshot),
      limits: await read($, limits),
      agents: await read($, agents),
      extras: await read($, agentExtra),
      git: await read($, git),
      gh: await read($, gh),
      activity: await read($, activity),
      collapsed: await read($, collapsed),
      resources: await read($, resources),
      branches: await read($, branches),
      creating: await read($, creating),
      workspacesGh: await read($, workspacesGh),
      focused: e.props.isFocused,
      hideBranch: (branch: string) => void hideBranch($, branch).catch(err => $.ui.toast(`Hide ${branch}: ${err?.message ?? err}`)),
      // Merge, like Create PR: the session does it, and reports back.
      mergePr: (pr: GitPr) =>
        void $.prompt
          .submit({ text: `Merge PR #${pr.number} (${pr.url}) once its checks pass: turn on auto-merge, or merge it now if it's already green.`, asUser: true })
          .catch(() => $.ui.toast('Merge: could not send the request to the session')),
      createPr: (branch: string) => void createPr($, branch).catch(() => undefined),
      toggle: (id: string) =>
        void update($, collapsed, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])).catch(() => undefined),
      columnsOn: await read($, columns),
      toggleColumns: () => void update($, columns, was => !was).catch(() => undefined),
      columns: e.props.bodyColumns,
      rows: e.props.scroll?.bodyRows,
      at: Date.now(),
      perf: perf.snapshot(),
    }
    // The terminal draws the same inspector in cells; the app surfaces as boxes.
    // Buttons keep their press handles across redraws, so a click made just before one still lands.
    const els = holdButtons($.ui.resolve(e), e)
    if (e.surface === 'terminal') {
      return perf.time('render', () => renderTerminal(els as TermElements, data, TERM_HELPERS))
    }
    return perf.time('render', () => renderDesktop(els as AppElements, data, HELPERS))
  })
}
