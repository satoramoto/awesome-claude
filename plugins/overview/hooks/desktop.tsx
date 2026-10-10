import type { Elements, RenderElement } from 'claude-code'

import { bytes, money, short, tokens } from '../kit/format'
import type { PerfSnapshot } from '../kit/perf'
import { C, GLYPH, INK, MUTED, RAMP, TRACK, levelColor } from '../kit/tokens'
import { EDGE, SPACE, kit } from '../kit/ui'

import type { Activity, Agent, AgentExtra, BranchView, GhInfo, GitInfo, GitNote, GitPr, Limit, Resources, Snapshot } from '../types'

/*
 * The app mode: a properties inspector for the session, drawn as an instrument.
 *
 * The rules it keeps (kit/tokens.ts and kit/ui.tsx hold the values):
 * - Colour: each hue one meaning (grey labels, slate quantity, blue live, amber
 *   near a limit, red failed, green done well, purple merged). Icons are muted.
 * - Type: values plain, labels and units dim, bold only for section titles and
 *   the context %, uppercase only for captions and a branch's state word.
 * - Spacing: the kit's SPACE scale and INSET; nothing else.
 * - Each fact once: calls and time in the header, failures in Events, cost in Accounting.
 */

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
  /** The session's share of the machine, for the footer. */
  resources: Resources | null
  /** The branches the session started, newest first. */
  branches: BranchView[]
  /** The branch a PR is being created for, if any. */
  creating: string | null
  /** Hide a branch. */
  hideBranch: (branch: string) => void
  /** Create PR on a branch without one. */
  createPr: (branch: string) => void
  /** Merge on an open PR. */
  mergePr: (pr: GitPr) => void
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
 * A context category's short name and colour: the fixed overhead in shades of
 * slate (it only says how much), messages in blue (the part that grows).
 */
const CATEGORY: Record<string, { name: string; color: string }> = {
  'System prompt': { name: 'System', color: RAMP.slate[0] },
  'System tools': { name: 'Tools', color: RAMP.slate[1] },
  'MCP tools': { name: 'MCP', color: RAMP.slate[2] },
  'MCP server instructions': { name: 'MCP notes', color: RAMP.slate[2] },
  'Custom agents': { name: 'Agents', color: RAMP.slate[3] },
  'Memory files': { name: 'Memory', color: RAMP.slate[3] },
  Skills: { name: 'Skills', color: RAMP.slate[3] },
  Messages: { name: 'Messages', color: C.blue },
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

/** An agent's status as its rail's colour: running blue, done green, failed red. */
const statusColor = (status: string): string =>
  status === 'running' || status === 'pending' ? C.blue : status === 'completed' ? C.ok : status === 'failed' ? C.bad : MUTED

/** A PR's state as one colour: merged purple, closed or draft grey, else by its checks. */
const prColor = (pr: GitPr) =>
  pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : pr.checks.failed ? C.bad : pr.checks.pending ? C.blue : C.ok

/** "2h18", "3d4h", from "resets in 2h 18m". */
const compact = (s: string) => s.replace('resets in ', '').replace(/ /g, '')

const shortTool = (name: string) => (name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name)

/**
 * The footer's lead: the session's share of the machine, ours against the
 * system's, under muted three-letter labels; ours turns amber or red when it's a big share.
 */
const machine = (k: ReturnType<typeof kit>, r: Resources | null): RenderElement[] => {
  if (!r) return []
  const hot = (part: number, whole: number) => (whole > 0 && part / whole > 0.5 ? C.bad : whole > 0 && part / whole > 0.25 ? C.warn : undefined)
  const pctOf = (n: number) => `${Math.round(n)}%`
  return [
    k.share('cpu', 'cpu', pctOf(r.cpu), pctOf(r.cpuAll), hot(r.cpu, r.cpuAll)),
    k.share('mem', 'mem', bytes(r.mem), bytes(r.memAll), hot(r.mem, r.memAll)),
    k.share('net', 'net', r.net === null ? '–' : bytes(r.net), bytes(r.netAll), r.net === null ? undefined : hot(r.net, r.netAll)),
  ]
}

export const renderDesktop = (els: AppElements, d: DesktopData, fx: Helpers): RenderElement => {
  const { Box, Text } = els
  const k = kit(els, 'desktop', d.columns)
  const a = d.activity
  const snap = d.snap
  const fold = (id: string) => ({ collapsed: d.collapsed.includes(id), onToggle: () => d.toggle(id) })

  // ---- header: the session's totals, four across ----
  const toolCalls = Object.values(a.tools).reduce((n, t) => n + t.n, 0)
  const running = d.agents.filter(x => x.status === 'running' || x.status === 'pending').length
  const metric = (key: string, value: string, label: string) => (
    <Box key={key} flexDirection="column" alignItems={key === 'time' ? 'flex-start' : key === 'files' ? 'flex-end' : 'center'}>
      <Text>{value}</Text>
      {k.caption(label)}
    </Box>
  )
  const header = (
    <Box key="header" flexDirection="column" paddingLeft={EDGE.left} paddingRight={EDGE.right}>
      {running ? <Text color={C.blue}>{`● ${running} agent${running === 1 ? '' : 's'} running`}</Text> : null}
      {/* Spread edge to edge: the first total on the left edge, the last on the right. */}
      <Box flexDirection="row" justifyContent="space-between" marginTop={running ? SPACE.block : 0}>
        {metric('time', a.startedAt ? short(d.at - a.startedAt) : '–', 'Elapsed')}
        {metric('turns', String(a.turns), 'Turns')}
        {metric('calls', String(toolCalls), 'Calls')}
        {metric('files', String(a.files.length), 'Files Δ')}
      </Box>
    </Box>
  )

  // ---- events: failed tool calls (the only place failures are counted) ----
  const failed = Object.entries(a.tools).filter(([, t]) => t.err > 0)
  const failures = failed.reduce((n, [, t]) => n + t.err, 0)
  const events = failed.length
    ? k.section({
        id: 'events',
        icon: 'events',
        title: 'Events',
        right: k.summary([[String(failures), 'failed', C.bad]]),
        ...fold('events'),
        children: failed.map(([name, t]) => k.prop(`ev-${name}`, shortTool(name), `${t.err} of ${t.n}`)),
      })
    : null

  // ---- context: the instrument's main meter ----
  const parts = snap
    ? snap.segments.flatMap(s => {
        const c = CATEGORY[s.name]
        return s.kind === 'used' && s.tokens > 0 ? [{ value: s.tokens, color: c?.color ?? INK, label: c?.name ?? s.name }] : []
      })
    : []
  const context = k.section({
    id: 'context',
    icon: GLYPH.context,
    title: 'Context',
    right: snap ? (
      <Text>
        <Text bold color={levelColor(snap.percent)}>{`${snap.percent}%`}</Text>
        <Text dimColor>{` of ${tokens(snap.max)}`}</Text>
      </Text>
    ) : (
      <Text dimColor>measuring…</Text>
    ),
    ...fold('context'),
    children: snap
      ? [
          <Box key="meter" flexDirection="column">
            {k.bar(parts, snap.max, { height: 0.5 })}
            {k.scale(snap.compactAt ? snap.compactAt / snap.max : undefined, C.warn)}
            {k.axis(
              'ctx-axis',
              [0, 0.25, 0.5, 0.75, 1].map(f => ({ at: f, text: f === 0 ? '0' : tokens(snap.max * f) })),
            )}
          </Box>,
          <Box key="legend" marginTop={SPACE.block}>
            {k.legend(
              'ctx',
              parts.map(p => ({ label: p.label!, color: p.color, figure: tokens(p.value) })),
            )}
          </Box>,
          <Box key="room" flexDirection="row" justifyContent="space-between" marginTop={SPACE.block}>
            <Box flexDirection="row" gap={SPACE.pair}>
              {k.caption(snap.compactAt ? 'Compaction' : 'No auto-compact')}
              {snap.compactAt ? <Text color={C.warn}>{tokens(snap.compactAt)}</Text> : null}
            </Box>
            <Box flexDirection="row" gap={SPACE.pair}>
              {k.caption('Headroom')}
              <Text>{tokens(Math.max(0, (snap.compactAt ?? snap.max) - snap.total))}</Text>
            </Box>
          </Box>,
        ]
      : null,
  })

  // ---- limits ----
  const windows = d.limits ?? []
  const limits = windows.length
    ? k.section({
        id: 'limits',
        icon: GLYPH.limits,
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

  // ---- activity: tool calls per turn, each bar sliced by tool ----
  // The busiest tools take shades of blue (one series, parts told apart), the rest one slate slice.
  const allTools = Object.entries(a.tools).sort((x, y) => y[1].n - x[1].n)
  const named = allTools.slice(0, RAMP.blue.length).map(([name], i) => ({ name, color: RAMP.blue[i]! }))
  const OTHER = RAMP.slate[1]
  const SLOTS = 16
  const log = a.turnLog.slice(-SLOTS)
  const first = a.turns - log.length + 1
  const sliced = log.map(p => {
    const by = p.tools ?? {}
    const other = Object.entries(by).reduce((n, [name, c]) => n + (named.some(t => t.name === name) ? 0 : c), 0)
    // Stacked bottom up, the busiest tool at the base; a turn without calls keeps a sliver.
    const stack = [...named.map(t => ({ value: by[t.name] ?? 0, color: t.color })), { value: other, color: OTHER }].reverse()
    return stack.some(x => x.value > 0) ? stack : [{ value: 0.05, color: TRACK }]
  })
  const peak = Math.max(0, ...log.map(p => p.calls ?? 0))
  const otherCount = allTools.slice(named.length).reduce((n, [, t]) => n + t.n, 0)
  const cacheIn = a.turnLog.reduce((n, p) => n + p.cacheRead, 0)
  const allIn = a.turnLog.reduce((n, p) => n + p.cacheRead + p.cacheWrite + p.input, 0)
  // Turn numbers under the first, middle and last bar.
  const ticks = log.length ? [0, Math.floor((log.length - 1) / 2), log.length - 1].filter((v, i, xs) => xs.indexOf(v) === i) : []
  const activity =
    log.length || toolCalls
      ? k.section({
          id: 'activity',
          icon: GLYPH.tools,
          title: 'Activity',
          right: k.summary([[String(peak), 'peak'], [`${allIn ? Math.round((cacheIn / allIn) * 100) : 0}%`, 'cached']]),
          ...fold('activity'),
          children: [
            <Box key="chart" flexDirection="column">
              {k.columns(sliced, { slots: SLOTS, height: 3.5 })}
              {k.axis(
                'act-axis',
                ticks.map(i => ({ at: (i + 0.5) / SLOTS, text: String(first + i).padStart(2, '0') })),
              )}
            </Box>,
            <Box key="legend" marginTop={SPACE.block}>
              {k.legend('act', [
                ...named.map(t => ({ label: shortTool(t.name), color: t.color, figure: String(a.tools[t.name]!.n) })),
                ...(otherCount ? [{ label: 'Other', color: OTHER, figure: String(otherCount) }] : []),
              ])}
            </Box>,
          ],
        })
      : null

  // ---- agents ----
  const agents = d.agents.length
    ? k.section({
        id: 'agents',
        icon: GLYPH.agents,
        title: 'Agents',
        right: k.summary([[String(d.agents.length), 'started'], running ? [String(running), 'running', C.blue] : null]),
        ...fold('agents'),
        children: fx.buildTree(d.agents).map(({ agent, depth }) => {
          const x = d.extras[agent.id]
          const ms = agent.status === 'running' && x?.startedAt !== undefined ? d.at - x.startedAt : x?.durationMs
          return k.rail(agent.id, {
            color: statusColor(agent.status),
            text: agent.description || agent.type,
            note: agent.type,
            figures: [x?.tokens !== undefined ? tokens(x.tokens) : '', ms !== undefined ? short(ms) : ''],
            indent: depth * 2,
          })
        }),
      })
    : null

  // ---- accounting: what the session cost, and on what ----
  const accounting = k.section({
    id: 'accounting',
    icon: GLYPH.cost,
    title: 'Accounting',
    right: k.summary([[a.cost !== undefined ? money(a.cost) : '–']]),
    ...fold('accounting'),
    children: [snap ? k.prop('model', 'Model', snap.model) : k.prop('model', 'Model', '–')],
  })

  return k.pinned(
    [header, events, context, limits, activity, agents, ...renderBranches(els, k, d, fold), accounting],
    k.perf(d.perf, { lead: machine(k, d.resources) }),
    d.rows,
  )
}

/**
 * Workspaces: the branches the session started, as the desktop app tracks them.
 * Each entry is two lines. First: the branch, its lines changed (dim) and its
 * state word, the only colour. Second, dim: its PR (linked) or where it lives,
 * one CI word, and one action.
 */
const renderBranches = (els: AppElements, k: ReturnType<typeof kit>, d: DesktopData, fold: (id: string) => { collapsed: boolean; onToggle: () => void }): RenderElement[] => {
  const { Box, Text, Link, Button } = els
  const entries = d.branches.map((b, i) => {
    const pr = b.pr
    const open = pr?.state === 'OPEN'
    const color = pr ? prColor(pr) : MUTED
    const word = !b.exists ? 'DELETED' : pr ? (open ? (pr.isDraft ? 'DRAFT' : 'OPEN') : pr.state) : b.pushed ? 'NO PR' : 'LOCAL'
    const ci = !pr || !open ? null : pr.checks.failed ? [`${pr.checks.failed} failing`, C.bad] : pr.checks.pending ? [`${pr.checks.pending} pending`, C.blue] : pr.checks.passed ? ['checks pass', C.ok] : null
    const action =
      !Button || !b.exists
        ? null
        : d.creating === b.branch
          ? <Text dimColor>creating PR…</Text>
          : !pr
            ? <Button key={`create-${b.branch}`} plain label="Create PR" onPress={() => d.createPr(b.branch)} />
            : open && !pr.isDraft
              ? <Button key={`merge-${pr.number}`} plain label="Merge" onPress={() => d.mergePr(pr)} />
              : null
    return (
      <Box key={`branch-${b.branch}`} flexDirection="column" marginTop={i === 0 ? 0 : SPACE.block}>
        <Box flexDirection="row" justifyContent="space-between" gap={SPACE.item}>
          <Text wrap="truncate">{b.branch}</Text>
          <Box flexDirection="row" gap={SPACE.item} flexShrink={0}>
            {b.insertions || b.deletions ? <Text dimColor>{`+${b.insertions} −${b.deletions}`}</Text> : null}
            <Text color={color}>{word}</Text>
          </Box>
        </Box>
        <Box flexDirection="row" justifyContent="space-between" gap={SPACE.item}>
          <Box flexDirection="row" gap={SPACE.pair} flexShrink={1}>
            {pr ? <Link href={pr.url} label={`#${pr.number}`} /> : null}
            <Text dimColor wrap="truncate">
              {pr ? pr.title : b.worktree ? `${b.place} (worktree)` : b.place}
            </Text>
          </Box>
          <Box flexDirection="row" gap={SPACE.item} flexShrink={0}>
            {b.conflicted ? <Text color={C.bad}>{`${b.conflicted} conflicted`}</Text> : null}
            {ci ? <Text color={ci[1]}>{ci[0]}</Text> : null}
            {action}
            {Button ? <Button key={`hide-${b.branch}`} plain dimColor label="hide" onPress={() => d.hideBranch(b.branch)} /> : null}
          </Box>
        </Box>
        {pr && open && pr.failing.length ? (
          <Text dimColor wrap="truncate">
            {pr.failing.slice(0, 3).join(', ')}
          </Text>
        ) : null}
      </Box>
    )
  })
  if (!entries.length) return []
  const merged = d.branches.filter(b => b.pr?.state === 'MERGED').length
  const openPrs = d.branches.filter(b => b.pr?.state === 'OPEN').length
  return [
    k.section({
      id: 'workspaces',
      icon: GLYPH.branch,
      title: 'Workspaces',
      right: k.summary([openPrs ? [String(openPrs), 'open', C.blue] : null, merged ? [String(merged), 'merged', C.purple] : null]),
      ...fold('workspaces'),
      children: entries,
    }),
  ]
}
