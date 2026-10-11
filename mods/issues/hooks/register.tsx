import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Issue, IssueList } from '../types'
import { renderApp, renderTerminal } from './view'
import type { AppElements, TermElements } from './view'

const PANE = 'issues'
/** How many open issues are read; past this the count shows a "+". */
const LIMIT = 100
const FIELDS = 'number,title,url,author,labels,assignees,comments,updatedAt'

const list = atom({ plugin: 'issues', key: 'list' } as const, null)

/** One issue from `gh issue list --json`, as plain data. */
export const toIssue = (json: any): Issue => ({
  number: Number(json.number),
  title: String(json.title ?? ''),
  url: String(json.url ?? ''),
  author: String(json.author?.login ?? ''),
  labels: (json.labels ?? []).map((l: any) => ({ name: String(l.name ?? ''), color: `#${String(l.color ?? '8e8e93')}` })),
  assignees: (json.assignees ?? []).map((a: any) => String(a.login ?? '')),
  comments: Array.isArray(json.comments) ? json.comments.length : Number(json.comments) || 0,
  updatedAt: Date.parse(json.updatedAt) || 0,
})

/** `owner/name` from an issue's URL. */
export const repoOf = (url: string) => /github\.com\/([^/]+\/[^/]+)\//.exec(url)?.[1] ?? ''

/** A one-line reason from gh's stderr. */
export const ghNote = (stderr: string): string => {
  if (/auth login|not logged|authenticat/i.test(stderr)) return 'gh not authenticated (run gh auth login)'
  if (/no git remote|none of the git remotes|not a git/i.test(stderr)) return 'No GitHub repository for this session'
  if (/disabled issues|has issues disabled/i.test(stderr)) return 'Issues are turned off for this repository'
  return (stderr.trim().split('\n')[0] || 'gh failed').slice(0, 120)
}

/** The session's repository's open issues, newest change first. */
const loadIssues = async ($: EngineInterface): Promise<IssueList> => {
  const at = Date.now()
  const cwd = await $.session.cwd()
  const gh = (args: string[]) => $.process.run(['gh', ...args], { cwd, timeoutMs: 20_000 })
  let run
  try {
    run = await gh(['issue', 'list', '--state', 'open', '--limit', String(LIMIT + 1), '--json', FIELDS])
  } catch {
    return { repo: '', issues: [], more: false, at, note: 'gh not installed' }
  }
  if (run.exitCode !== 0) return { repo: '', issues: [], more: false, at, note: ghNote(run.stderr) }
  let issues: Issue[]
  try {
    issues = (JSON.parse(run.stdout) as any[]).map(toIssue).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return { repo: '', issues: [], more: false, at, note: 'Unreadable gh output' }
  }
  // With no issue to read it from, the repository's name takes a call of its own.
  let repo = repoOf(issues[0]?.url ?? '')
  if (!repo) {
    const view = await gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).catch(() => null)
    repo = view?.exitCode === 0 ? view.stdout.trim() : ''
  }
  return { repo, issues: issues.slice(0, LIMIT), more: issues.length > LIMIT, at }
}

// Nothing runs while the pane isn't shown: a timer reads gh again while it is,
// every READ_EVERY, or within AT_MOST once something marked the list stale.
const READ_EVERY = 120_000
const AT_MOST = 20_000
let stale = true
let lastRead = 0
let busy = false
let shownAt = 0
let shown = false

/** Whether the issues pane is the one shown and placed; asked at most every 2 s. */
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

const refresh = async ($: EngineInterface) => {
  if (busy) return
  busy = true
  try {
    stale = false
    lastRead = Date.now()
    const fresh = await loadIssues($)
    const old = await read($, list)
    // Only a real change redraws (`at` moves on every read).
    if (!old || JSON.stringify({ ...old, at: 0 }) !== JSON.stringify({ ...fresh, at: 0 })) await update($, list, () => fresh)
  } finally {
    busy = false
  }
}

const tick = async ($: EngineInterface) => {
  if (!(await isShown($))) return
  if (Date.now() - lastRead >= (stale ? AT_MOST : READ_EVERY)) await refresh($)
}

let worker: { cancel: () => void } | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'issues', description: "Open a pane with the open GitHub issues of this session's repository" })
    worker?.cancel()
    worker = $.clock.every(5_000, () => void tick($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'issues' }, async $ => {
    // Opened by the person: read now rather than on the next tick.
    shownAt = 0
    await $.ui.open({ id: PANE, title: 'Issues' })
    void refresh($).catch(() => undefined)

    return { text: 'Issues pane opened.' }
  })

  // A gh issue command (opening, closing, commenting) changes the list: read it again soon.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgh issue\b/.test(e.command)) stale = true

    return ran
    // Only watching: should it fail, the call goes on as if it weren't here.
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const data = await read($, list)
    const at = Date.now()
    if (e.surface === 'terminal') return renderTerminal($.ui.resolve(e) as TermElements, data, at)
    return renderApp($.ui.resolve(e) as AppElements, data, e.props.bodyColumns, at)
  })
}
