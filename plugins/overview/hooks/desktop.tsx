import type { Elements, RenderElement } from 'claude-code'

import { duration, money, short, tokens } from '../kit/format'
import type { PerfSnapshot } from '../kit/perf'
import { C, GLYPH, MUTED, levelColor } from '../kit/tokens'
import { kit } from '../kit/ui'

import type { Activity, Agent, AgentExtra, GhInfo, GitInfo, GitNote, GitPr, Limit, Snapshot } from '../types'

/** The elements the app mode draws with: the desktop and VS Code have these. */
export type AppElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Link' | 'Button' | 'Svg'>

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
  /** The pane's height in rows, so the footer can sit on its bottom edge. */
  rows?: number
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

/**
 * A context category's short name and colour. One cool family for what is
 * fixed, amber for messages: the part that grows, and the one to watch.
 */
const CATEGORY: Record<string, { name: string; color: string }> = {
  'System prompt': { name: 'System', color: C.slate },
  'System tools': { name: 'Tools', color: C.blue },
  'MCP tools': { name: 'MCP', color: C.cyan },
  'MCP server instructions': { name: 'MCP notes', color: C.cyan },
  'Custom agents': { name: 'Agents', color: C.purple },
  'Memory files': { name: 'Memory', color: C.purple },
  Skills: { name: 'Skills', color: C.orchid },
  Messages: { name: 'Messages', color: C.warn },
}

/** Three letters for a context category: what the terminal layout's chips show. */
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

// A properties inspector for the session, drawn as an instrument: a header of
// the session's totals, then one collapsible section per subject, its readings
// in one column grid (label, gauge, value, unit). The context meter, with its
// scale and the compaction mark, is the one bold thing; the rest stays quiet.
export const renderDesktop = (els: AppElements, d: DesktopData, fx: Helpers): RenderElement => {
  const { Box, Text } = els
  const k = kit(els, 'desktop', d.columns)
  const a = d.activity
  const snap = d.snap
  const fold = (id: string) => ({ collapsed: d.collapsed.includes(id), onToggle: () => d.toggle(id) })

  // ---- the header: the session's totals ----
  const toolCalls = Object.values(a.tools).reduce((n, t) => n + t.n, 0)
  const toolErrors = Object.values(a.tools).reduce((n, t) => n + t.err, 0)
  const running = d.agents.filter(x => x.status === 'running' || x.status === 'pending').length
  const metric = (key: string, glyph: string, value: string, unit: string) => (
    <Box key={key} flexDirection="row" gap={0.5} flexShrink={0}>
      <Text dimColor>{glyph}</Text>
      <Text>
        {value}
        <Text dimColor>{` ${unit}`}</Text>
      </Text>
    </Box>
  )
  const header = (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Text bold>{a.cost !== undefined ? money(a.cost) : '–'}</Text>
        <Box flexDirection="row" gap={1.2}>
          {running ? k.flag('running', C.warn, GLYPH.running, running) : null}
          {toolErrors ? k.flag('failed', C.bad, GLYPH.failed, toolErrors) : null}
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" gap={1} marginTop={0.2}>
        {metric('time', GLYPH.time, a.startedAt ? short(d.at - a.startedAt) : '–', '')}
        {metric('turns', GLYPH.turns, String(a.turns), 'turns')}
        {metric('calls', GLYPH.tools, String(toolCalls), 'calls')}
        {metric('files', GLYPH.files, String(a.files.length), 'files')}
      </Box>
    </Box>
  )

  // ---- context: the instrument's main meter ----
  const parts = snap
    ? snap.segments.flatMap(s => {
        const c = CATEGORY[s.name]
        return s.kind === 'used' && s.tokens > 0 ? [{ value: s.tokens, color: c?.color ?? C.slate, label: c?.name ?? s.name }] : []
      })
    : []
  const context = k.section({
    id: 'context',
    icon: GLYPH.context,
    color: snap ? levelColor(snap.percent) : MUTED,
    title: 'Context',
    right: snap ? (
      <Text>
        <Text bold color={levelColor(snap.percent)}>{`${snap.percent}%`}</Text>
        <Text dimColor>{`  ${tokens(snap.total)} of ${tokens(snap.max)}`}</Text>
      </Text>
    ) : (
      <Text dimColor>measuring…</Text>
    ),
    ...fold('context'),
    children: snap
      ? [
          <Box key="meter" flexDirection="column" marginTop={0.2}>
            {k.bar(parts, snap.max, { height: 0.5 })}
            {k.scale(snap.compactAt ? snap.compactAt / snap.max : undefined, C.warn)}
          </Box>,
          <Box key="legend" flexDirection="row" flexWrap="wrap" marginTop={0.1}>
            {parts.map(p => (
              <Box key={`legend-${p.label}`} width={16} flexDirection="row" alignItems="center" gap={0.5}>
                {k.swatch(p.color)}
                <Box flexShrink={1}>
                  <Text dimColor wrap="truncate">
                    {p.label}
                  </Text>
                </Box>
                <Box flexShrink={0}>
                  <Text>{tokens(p.value)}</Text>
                </Box>
              </Box>
            ))}
          </Box>,
          k.prop('model', 'Model', snap.model),
          snap.compactAt ? k.prop('compact', 'Compacts', <Text color={C.warn}>{`at ${tokens(snap.compactAt)}`}</Text>) : null,
        ]
      : null,
  })

  // ---- limits ----
  const windows = d.limits ?? []
  const limits = windows.length
    ? k.section({
        id: 'limits',
        icon: GLYPH.limits,
        color: C.slate,
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
        icon: GLYPH.turns,
        color: C.blue,
        title: 'Turns',
        right: (
          <Box flexDirection="row" gap={1.5}>
            <Text>
              {`${allIn ? Math.round((cacheIn / allIn) * 100) : 0}%`}
              <Text dimColor> cached</Text>
            </Text>
            <Text>
              {tokens(a.turnLog.reduce((n, p) => n + p.output, 0))}
              <Text dimColor> out</Text>
            </Text>
          </Box>
        ),
        ...fold('turns'),
        children: k.columns(
          a.turnLog.map(p => [
            { value: p.output, color: C.ok },
            { value: p.input, color: C.cyan },
            { value: p.cacheWrite, color: C.purple },
            { value: p.cacheRead, color: C.blue },
          ]),
          { slots: 24, height: 1.8 },
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
        icon: GLYPH.tools,
        color: C.blue,
        title: 'Tools',
        right: (
          <Text>
            {String(toolCalls)}
            <Text dimColor> calls</Text>
          </Text>
        ),
        ...fold('tools'),
        children: toolRows.map(([name, t]) =>
          k.reading(`tool-${name}`, {
            label: name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name,
            value: t.n,
            max: toolMax,
            color: C.blue,
            figure: String(t.n),
            unit: t.err ? `${t.err} ✕` : undefined,
            unitColor: t.err ? C.bad : undefined,
          }),
        ),
      })
    : null

  // ---- agents ----
  const agents = d.agents.length
    ? k.section({
        id: 'agents',
        icon: GLYPH.agents,
        color: running ? C.warn : C.slate,
        title: 'Agents',
        right: (
          <Text>
            {String(d.agents.length)}
            <Text dimColor> started</Text>
          </Text>
        ),
        ...fold('agents'),
        children: fx.buildTree(d.agents).map(({ agent, depth }) => {
          const x = d.extras[agent.id]
          const time =
            agent.status === 'running' && x?.startedAt !== undefined
              ? duration(d.at - x.startedAt)
              : x?.durationMs !== undefined
                ? duration(x.durationMs)
                : ''
          const figure = [x?.tokens !== undefined ? tokens(x.tokens) : '', time].filter(Boolean).join('  ')
          return k.rail(agent.id, { color: statusColor(agent.status), text: agent.description || agent.type, note: agent.type, figure, indent: depth * 2 })
        }),
      })
    : null

  return (
    k.pinned([header, context, limits, turns, tools, agents, renderGit(els, k, d, fold)], k.perf(d.perf), d.rows)
  )
}

const renderGit = (
  els: AppElements,
  k: ReturnType<typeof kit>,
  d: DesktopData,
  fold: (id: string) => { collapsed: boolean; onToggle: () => void },
): RenderElement => {
  const { Box, Text } = els
  const g = d.git
  if (g === null || !g.ok) {
    return k.section({ id: 'git', icon: GLYPH.branch, color: C.slate, title: 'Git', right: <Text dimColor>{g === null ? 'reading…' : g.note}</Text>, children: null })
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
    icon: GLYPH.branch,
    color: C.slate,
    title: g.branch,
    right: (
      <Box flexDirection="row" gap={1}>
        {g.ahead ? <Text color={C.ok}>{`↑${g.ahead}`}</Text> : null}
        {g.behind ? <Text color={C.warn}>{`↓${g.behind}`}</Text> : null}
        {g.insertions ? <Text color={C.ok}>{`+${g.insertions}`}</Text> : null}
        {g.deletions ? <Text color={C.bad}>{`−${g.deletions}`}</Text> : null}
      </Box>
    ),
    ...fold('git'),
    children: [
      k.prop('repo', 'Repository', g.worktree.linked ? `${g.repo} / ${g.worktree.name}` : g.repo),
      k.prop(
        'changes',
        'Changes',
        changed.length === 0 ? (
          <Text dimColor>clean</Text>
        ) : (
          <Box flexDirection="row" gap={1.5}>
            {changed.map(([n, word, color]) => (
              <Text>
                <Text color={color}>{String(n)}</Text>
                <Text dimColor>{` ${word}`}</Text>
              </Text>
            ))}
          </Box>
        ),
      ),
      ...prs.map(pr => prRow(els, pr)),
    ],
  })
}

/** One PR on a rail: its state as the rail's colour, the number as a link, the title, checks on the right. */
const prRow = ({ Box, Text, Link }: AppElements, pr: GitPr) => {
  const color = pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : pr.checks.failed ? C.bad : pr.checks.pending ? C.warn : C.ok
  const { passed, failed, pending } = pr.checks
  const open = pr.state === 'OPEN'
  const checks = !open ? (pr.state === 'MERGED' ? 'merged' : 'closed') : failed ? `${failed} failing` : pending ? `${pending} pending` : passed ? 'checks pass' : ''
  return (
    <Box key={`pr-${pr.number}`} flexDirection="row" gap={1}>
      <Box width={0.25} backgroundColor={color} flexShrink={0} />
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
