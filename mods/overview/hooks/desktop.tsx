import type { Elements, RenderElement } from 'claude-code'

import { duration, money, short, tokens } from '@kit/format'
import type { PerfSnapshot } from '@kit/perf'
import { C, GLYPH, MUTED, PALETTE, levelColor } from '@kit/tokens'
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

const statusGlyph = (status: string): { glyph: string; color: string } =>
  status === 'running' || status === 'pending'
    ? { glyph: GLYPH.running, color: C.warn }
    : status === 'completed'
      ? { glyph: GLYPH.done, color: C.ok }
      : status === 'failed'
        ? { glyph: GLYPH.failed, color: C.bad }
        : { glyph: GLYPH.stopped, color: MUTED }

export const renderDesktop = (els: AppElements, d: DesktopData, fx: Helpers): RenderElement => {
  const { Box, Text } = els
  const k = kit(els, 'desktop', d.columns)
  const a = d.activity
  const snap = d.snap
  const fold = (id: string) => ({ collapsed: d.collapsed.includes(id), onToggle: () => d.toggle(id) })

  // ---- the top line ----
  const toolCalls = Object.values(a.tools).reduce((n, t) => n + t.n, 0)
  const toolErrors = Object.values(a.tools).reduce((n, t) => n + t.err, 0)
  const top = k.flow([
    k.stat(GLYPH.context, snap ? levelColor(snap.percent) : MUTED, snap ? `${snap.percent}%` : '–'),
    k.stat(GLYPH.cost, C.ok, a.cost !== undefined ? money(a.cost).slice(1) : '–'),
    k.stat(GLYPH.time, C.cyan, a.startedAt ? short(d.at - a.startedAt) : '–'),
    k.stat(GLYPH.turns, C.blue, String(a.turns)),
    k.stat(GLYPH.tools, toolErrors ? C.warn : C.purple, String(toolCalls), toolErrors ? ` ${toolErrors}${GLYPH.failed}` : undefined),
    k.stat(GLYPH.files, C.warn, String(a.files.length)),
  ])

  // ---- context ----
  const parts = snap
    ? snap.segments.flatMap((s, i) => {
        const color = fx.colorOf(snap.segments, i)
        return color && s.tokens > 0 ? [{ value: s.tokens, color, label: tagOf(s.name) }] : []
      })
    : []
  const context = k.section({
    id: 'context',
    icon: GLYPH.layers,
    color: C.blue,
    title: 'Context',
    right: snap ? (
      <Text dimColor wrap="truncate">
        {`${tokens(snap.total)}/${tokens(snap.max)}${snap.compactAt ? ` ↧${tokens(snap.compactAt)}` : ''}`}
      </Text>
    ) : (
      <Text dimColor>measuring…</Text>
    ),
    ...fold('context'),
    children: snap ? k.legendBar(parts, snap.max, tokens) : null,
  })

  // ---- turns ----
  const cacheIn = a.turnLog.reduce((n, p) => n + p.cacheRead, 0)
  const allIn = a.turnLog.reduce((n, p) => n + p.cacheRead + p.cacheWrite + p.input, 0)
  const turns = a.turnLog.length
    ? k.section({
        id: 'turns',
        icon: GLYPH.turns,
        color: C.cyan,
        title: 'Turns',
        right: (
          <Text>
            <Text color={C.blue}>{`${allIn ? Math.round((cacheIn / allIn) * 100) : 0}%`}</Text>
            <Text dimColor> cached </Text>
            <Text color={C.ok}>{tokens(a.turnLog.reduce((n, p) => n + p.output, 0))}</Text>
            <Text dimColor> out</Text>
          </Text>
        ),
        ...fold('turns'),
        children: k.columns(
          a.turnLog.map(p => [
            { value: p.output, color: C.ok },
            { value: p.input, color: C.cyan },
            { value: p.cacheWrite, color: C.purple },
            { value: p.cacheRead, color: C.blue },
          ]),
          { slots: 24 },
        ),
      })
    : null

  // ---- tools ----
  const toolRows = Object.entries(a.tools)
    .sort((x, y) => y[1].n - x[1].n)
    .slice(0, 8)
  const toolMax = Math.max(1, ...toolRows.map(([, t]) => t.n))
  const tools = toolRows.length
    ? k.section({
        id: 'tools',
        icon: GLYPH.tools,
        color: C.purple,
        title: 'Tools',
        right: <Text dimColor>{String(toolCalls)}</Text>,
        ...fold('tools'),
        children: toolRows.map(([name, t], i) =>
          k.labelBar(
            `tool-${name}`,
            name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name,
            [
              { value: t.n - t.err, color: PALETTE[i % PALETTE.length] ?? C.blue },
              { value: t.err, color: C.bad },
            ],
            toolMax,
            <Text>
              <Text bold>{String(t.n)}</Text>
              {t.err ? <Text color={C.bad}>{` ${t.err}${GLYPH.failed}`}</Text> : null}
            </Text>,
          ),
        ),
      })
    : null

  // ---- agents ----
  const running = d.agents.filter(x => x.status === 'running' || x.status === 'pending').length
  const agents = d.agents.length
    ? k.section({
        id: 'agents',
        icon: GLYPH.agents,
        color: C.warn,
        title: 'Agents',
        right: running ? <Text color={C.warn}>{`${running} running`}</Text> : <Text dimColor>{String(d.agents.length)}</Text>,
        ...fold('agents'),
        children: fx.buildTree(d.agents).map(({ agent, depth }) => {
          const s = statusGlyph(agent.status)
          const x = d.extras[agent.id]
          const time =
            agent.status === 'running' && x?.startedAt !== undefined
              ? duration(d.at - x.startedAt)
              : x?.durationMs !== undefined
                ? duration(x.durationMs)
                : ''
          const figure = [x?.tokens !== undefined ? tokens(x.tokens) : '', time].filter(Boolean).join(' ')
          return k.item(agent.id, s.glyph, s.color, agent.description || agent.type, figure, depth * 2)
        }),
      })
    : null

  // ---- limits ----
  const limits = (d.limits ?? []).length
    ? k.section({
        id: 'limits',
        icon: GLYPH.limits,
        color: C.ok,
        title: 'Limits',
        ...fold('limits'),
        children: (d.limits ?? []).map(w => {
          const color = levelColor(w.percent)
          const reset = w.resetsAt ? fx.resetIn(w.resetsAt, d.at).replace('resets in ', '').replace(/ /g, '') : ''
          return k.labelBar(
            `limit-${w.kind}`,
            fx.limitLabel(w.kind),
            [{ value: Math.min(100, Math.max(0, w.percent)), color }],
            100,
            <Text>
              <Text bold color={color}>{`${Math.round(w.percent)}%`}</Text>
              {reset ? <Text dimColor>{` ${reset}`}</Text> : null}
            </Text>,
          )
        }),
      })
    : null

  return (
    <Box flexDirection="column">
      {top}
      {k.grid([context, turns, tools, agents, limits, renderGit(els, k, d, fold)].filter((s): s is RenderElement => s !== null))}
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
    return k.section({ id: 'git', icon: GLYPH.branch, color: C.blue, title: 'Git', right: <Text dimColor>{g === null ? 'reading…' : g.note}</Text>, children: null })
  }
  const counts: [number, string, string][] = [
    [g.conflicted, GLYPH.failed, C.bad],
    [g.staged, '●', C.ok],
    [g.modified, '●', C.warn],
    [g.untracked, '+', C.cyan],
  ]
  const state = counts.filter(([n]) => n > 0)
  const hub = d.gh
  const prs = hub && hub.root === g.root && !hub.note ? hub.prs.slice(0, 5) : []
  return k.section({
    id: 'git',
    icon: GLYPH.branch,
    color: C.blue,
    title: g.branch,
    right: (
      <Text>
        {g.ahead ? <Text color={C.ok}>{`${GLYPH.up}${g.ahead} `}</Text> : null}
        {g.behind ? <Text color={C.warn}>{`${GLYPH.down}${g.behind} `}</Text> : null}
        {g.upstream && !g.ahead && !g.behind ? <Text color={C.ok}>{`${GLYPH.done} `}</Text> : null}
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
          {state.length === 0 ? <Text color={C.ok}>clean</Text> : state.map(([n, glyph, color]) => <Text color={color}>{`${glyph}${n} `}</Text>)}
        </Text>,
      ),
      ...prs.map(pr => prRow(els, pr)),
    ],
  })
}

/** One PR on a line: state glyph, the number as a link, the title, check and review marks. */
const prRow = ({ Box, Text, Link }: AppElements, pr: GitPr) => {
  const color = pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : C.ok
  const { passed, failed, pending } = pr.checks
  const open = pr.state === 'OPEN'
  return (
    <Box key={`pr-${pr.number}`} flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
      <Box flexDirection="row" gap={1} alignItems="center" flexShrink={1}>
        <Text color={color}>{GLYPH.pr}</Text>
        <Link href={pr.url} label={`#${pr.number}`} />
        <Text wrap="truncate" dimColor={!open || pr.isDraft} bold={pr.current}>
          {pr.title}
        </Text>
      </Box>
      <Text>
        {!open ? <Text dimColor>{pr.state === 'MERGED' ? 'merged' : 'closed'}</Text> : null}
        {open && failed ? <Text color={C.bad}>{`${GLYPH.failed}${failed} `}</Text> : null}
        {open && pending ? <Text color={C.warn}>{`${GLYPH.pending}${pending} `}</Text> : null}
        {open && passed && !failed && !pending ? <Text color={C.ok}>{`${GLYPH.done} `}</Text> : null}
        {pr.review === 'APPROVED' ? <Text color={C.ok}>●</Text> : null}
        {pr.review === 'CHANGES_REQUESTED' ? <Text color={C.bad}>●</Text> : null}
        {pr.review === 'REVIEW_REQUIRED' ? <Text color={C.warn}>○</Text> : null}
      </Text>
    </Box>
  )
}
