import type { Elements, RenderElement } from 'claude-code'

import { duration, money, short, tokens } from '@kit/format'
import type { PerfSnapshot } from '@kit/perf'
import { C, MUTED, levelColor } from '@kit/tokens'
import { kit } from '@kit/ui'

import type { Activity, Agent, AgentExtra, GhInfo, GitInfo, GitNote, GitPr, Limit, Snapshot } from '../types'

/** The elements the app mode draws with: the desktop and VS Code have these. */
export type AppElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Link' | 'Button'>

export type DesktopData = {
  snap: Snapshot | null
  limits: Limit[] | null
  agents: Agent[]
  extras: Record<string, AgentExtra>
  git: GitInfo | GitNote | null
  gh: GhInfo | null
  activity: Activity
  /** Section ids the person folded. */
  collapsed: string[]
  /** Folds or unfolds a section. */
  toggle: (id: string) => void
  /** The pane's width in cells. */
  columns: number
  /** What the mod cost, for the debug footer. */
  perf: PerfSnapshot
  /** The clock elapsed times and resets are drawn against. */
  at: number
}

/** What the app mode borrows from register.tsx, passed in so this file has no cycle back. */
export type Helpers = {
  colorOf: (segments: Snapshot['segments'], i: number) => string | undefined
  limitLabel: (kind: string) => string
  resetIn: (resetsAt: string | undefined, at: number) => string
  buildTree: (list: Agent[]) => Array<{ agent: Agent; depth: number }>
}

/** Three letters for a context category, shown beside its chip. */
export const tagOf = (name: string): string => {
  const known: Record<string, string> = {
    'System prompt': 'sys',
    'System tools': 'tls',
    'MCP tools': 'mcp',
    'Custom agents': 'agt',
    'Memory files': 'mem',
    Skills: 'skl',
    Messages: 'msg',
  }
  return known[name] ?? name.slice(0, 3).toLowerCase()
}

/** A status as the colour of its rail. */
const statusColor = (status: string): string =>
  status === 'running' || status === 'pending' ? C.warn : status === 'completed' ? C.ok : status === 'failed' ? C.bad : MUTED

/** "2h18", "3d4h", from "resets in 2h 18m". */
const compact = (s: string) => s.replace('resets in ', '').replace(/ /g, '')

// Drawn as an instrument: every line a reading (a label, a thin gauge, a value,
// a unit), each section in its own bubble, colour only where it means something.
export const renderDesktop = (els: AppElements, d: DesktopData, fx: Helpers): RenderElement => {
  const { Box, Text } = els
  const k = kit(els, 'desktop', d.columns)
  const a = d.activity
  const snap = d.snap
  const fold = (id: string) => ({ collapsed: d.collapsed.includes(id), onToggle: () => d.toggle(id) })

  // ---- the summary line ----
  const toolCalls = Object.values(a.tools).reduce((n, t) => n + t.n, 0)
  const toolErrors = Object.values(a.tools).reduce((n, t) => n + t.err, 0)
  const facts = [a.startedAt ? short(d.at - a.startedAt) : '', `${a.turns} turns`, `${toolCalls} calls`, `${a.files.length} files`].filter(Boolean)
  const summary = (
    <Box flexDirection="row" justifyContent="space-between" gap={1}>
      <Text wrap="truncate">
        <Text bold>{a.cost !== undefined ? money(a.cost) : '–'}</Text>
        <Text dimColor>{`  ${facts.join(' · ')}`}</Text>
      </Text>
      {toolErrors ? <Text color={C.bad}>{`${toolErrors} failed`}</Text> : null}
    </Box>
  )

  // ---- context ----
  const parts = snap
    ? snap.segments.flatMap((s, i) => {
        const color = fx.colorOf(snap.segments, i)
        return color && s.tokens > 0 ? [{ value: s.tokens, color, label: tagOf(s.name) }] : []
      })
    : []
  const context = k.section({
    id: 'context',
    title: 'Context',
    right: snap ? <Text dimColor>{snap.model}</Text> : <Text dimColor>measuring…</Text>,
    ...fold('context'),
    children: snap
      ? [
          k.reading('ctx', {
            label: 'Used',
            value: snap.percent,
            max: 100,
            color: levelColor(snap.percent),
            figure: `${snap.percent}%`,
            unit: tokens(snap.total),
          }),
          k.legendBar(parts, snap.max, tokens, { height: 0.35 }),
          snap.compactAt ? <Text dimColor>{`Compacts at ${tokens(snap.compactAt)} of ${tokens(snap.max)}`}</Text> : null,
        ]
      : null,
  })

  // ---- limits ----
  const windows = d.limits ?? []
  const limits = windows.length
    ? k.section({
        id: 'limits',
        title: 'Limits',
        ...fold('limits'),
        children: windows.map(w =>
          k.reading(`limit-${w.kind}`, {
            label: fx.limitLabel(w.kind),
            value: Math.min(100, Math.max(0, w.percent)),
            max: 100,
            color: levelColor(w.percent),
            figure: `${Math.round(w.percent)}%`,
            unit: w.resetsAt ? compact(fx.resetIn(w.resetsAt, d.at)) : undefined,
          }),
        ),
      })
    : null

  // ---- turns ----
  const cacheIn = a.turnLog.reduce((n, p) => n + p.cacheRead, 0)
  const allIn = a.turnLog.reduce((n, p) => n + p.cacheRead + p.cacheWrite + p.input, 0)
  const turns = a.turnLog.length
    ? k.section({
        id: 'turns',
        title: 'Turns',
        right: (
          <Text dimColor>{`${allIn ? Math.round((cacheIn / allIn) * 100) : 0}% cached · ${tokens(a.turnLog.reduce((n, p) => n + p.output, 0))} out`}</Text>
        ),
        ...fold('turns'),
        children: k.columns(
          a.turnLog.map(p => [
            { value: p.output, color: C.ok },
            { value: p.input, color: C.cyan },
            { value: p.cacheWrite, color: C.purple },
            { value: p.cacheRead, color: C.blue },
          ]),
          { slots: 24, height: 2 },
        ),
      })
    : null

  // ---- tools ----
  const toolRows = Object.entries(a.tools)
    .sort((x, y) => y[1].n - x[1].n)
    .slice(0, 6)
  const toolMax = Math.max(1, ...toolRows.map(([, t]) => t.n))
  const tools = toolRows.length
    ? k.section({
        id: 'tools',
        title: 'Tools',
        right: <Text dimColor>{`${toolCalls} calls`}</Text>,
        ...fold('tools'),
        children: toolRows.map(([name, t]) =>
          k.reading(`tool-${name}`, {
            label: name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name,
            value: t.n,
            max: toolMax,
            color: C.blue,
            figure: String(t.n),
            unit: t.err ? `${t.err}✕` : undefined,
            unitColor: t.err ? C.bad : undefined,
          }),
        ),
      })
    : null

  // ---- agents ----
  const running = d.agents.filter(x => x.status === 'running' || x.status === 'pending').length
  const agents = d.agents.length
    ? k.section({
        id: 'agents',
        title: 'Agents',
        right: running ? <Text color={C.warn}>{`${running} running`}</Text> : <Text dimColor>{String(d.agents.length)}</Text>,
        ...fold('agents'),
        children: fx.buildTree(d.agents).map(({ agent, depth }) => {
          const x = d.extras[agent.id]
          const time =
            agent.status === 'running' && x?.startedAt !== undefined
              ? duration(d.at - x.startedAt)
              : x?.durationMs !== undefined
                ? duration(x.durationMs)
                : ''
          const figure = [x?.tokens !== undefined ? tokens(x.tokens) : '', time].filter(Boolean).join(' · ')
          return k.rail(agent.id, { color: statusColor(agent.status), text: agent.description || agent.type, note: agent.type, figure, indent: depth * 2 })
        }),
      })
    : null

  return (
    <Box flexDirection="column">
      {summary}
      {k.grid([context, limits, turns, tools, agents, renderGit(els, k, d, fold)].filter((s): s is RenderElement => s !== null))}
      {k.perf(d.perf)}
    </Box>
  )
}

const renderGit = (
  els: AppElements,
  k: ReturnType<typeof kit>,
  d: DesktopData,
  fold: (id: string) => { collapsed: boolean; onToggle: () => void },
): RenderElement => {
  const { Text } = els
  const g = d.git
  if (g === null || !g.ok) {
    return k.section({ id: 'git', title: 'Git', right: <Text dimColor>{g === null ? 'reading…' : g.note}</Text>, children: null })
  }
  const state: [number, string, string][] = [
    [g.conflicted, 'conflicted', C.bad],
    [g.staged, 'staged', C.ok],
    [g.modified, 'modified', C.warn],
    [g.untracked, 'new', C.cyan],
  ]
  const changed = state.filter(([n]) => n > 0)
  const hub = d.gh
  const prs = hub && hub.root === g.root && !hub.note ? hub.prs.slice(0, 5) : []
  return k.section({
    id: 'git',
    title: g.branch,
    right: (
      <Text>
        {g.ahead ? <Text color={C.ok}>{`↑${g.ahead} `}</Text> : null}
        {g.behind ? <Text color={C.warn}>{`↓${g.behind} `}</Text> : null}
        {g.insertions ? <Text color={C.ok}>{`+${g.insertions} `}</Text> : null}
        {g.deletions ? <Text color={C.bad}>{`−${g.deletions}`}</Text> : null}
      </Text>
    ),
    ...fold('git'),
    children: [
      k.line(
        'git-state',
        <Text dimColor wrap="truncate-start">
          {g.worktree.linked ? `${g.repo}/${g.worktree.name}` : g.repo}
        </Text>,
        <Text>
          {changed.length === 0 ? (
            <Text dimColor>clean</Text>
          ) : (
            changed.map(([n, word, color], i) => <Text color={color}>{`${i ? ' · ' : ''}${n} ${word}`}</Text>)
          )}
        </Text>,
      ),
      ...prs.map(pr => prRow(els, k, pr)),
    ],
  })
}

/** One PR on a rail: its state as the rail's colour, the number as a link, the title, checks on the right. */
const prRow = ({ Box, Text, Link }: AppElements, k: ReturnType<typeof kit>, pr: GitPr) => {
  const color = pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : pr.checks.failed ? C.bad : pr.checks.pending ? C.warn : C.ok
  const { passed, failed, pending } = pr.checks
  const open = pr.state === 'OPEN'
  const checks = !open ? (pr.state === 'MERGED' ? 'merged' : 'closed') : failed ? `${failed} failing` : pending ? `${pending} pending` : passed ? 'checks pass' : ''
  return (
    <Box key={`pr-${pr.number}`} flexDirection="row" gap={1} marginTop={0.2}>
      <Box width={0.3} backgroundColor={color} flexShrink={0} />
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1} gap={1}>
        <Box flexDirection="row" gap={1} flexShrink={1}>
          <Link href={pr.url} label={`#${pr.number}`} />
          <Text wrap="truncate" dimColor={!open || pr.isDraft} bold={pr.current}>
            {pr.title}
          </Text>
        </Box>
        <Text color={failed && open ? C.bad : undefined} dimColor={!(failed && open)}>
          {checks}
        </Text>
      </Box>
    </Box>
  )
}
