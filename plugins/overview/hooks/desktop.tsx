import type { Elements, RenderElement } from 'claude-code'

import { bytes, duration, money, short, tokens } from '../kit/format'
import type { PerfSnapshot } from '../kit/perf'
import { C, GLYPH, MUTED, levelColor } from '../kit/tokens'
import { fold as foldArrow, kit } from '../kit/ui'

import type { Activity, Agent, AgentExtra, BranchView, GhInfo, GitInfo, GitNote, GitPr, Limit, Resources, Snapshot } from '../types'

/**
 * The session's share of the machine: CPU, memory, disk and network, each ours
 * against the system's. Ours turns amber or red when it's a big share.
 */
const machine = (k: ReturnType<typeof kit>, r: Resources | null): RenderElement[] => {
  if (!r) return []
  const hot = (part: number, whole: number) => (whole > 0 && part / whole > 0.5 ? C.bad : whole > 0 && part / whole > 0.25 ? C.warn : undefined)
  const pctOf = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`
  // Tight on purpose: the footer is one row. Rates are per second; the disk is the system's.
  return [
    k.share('cpu', '⚙', C.blue, pctOf(r.cpu), pctOf(r.cpuAll), hot(r.cpu, r.cpuAll)),
    k.share('mem', '▦', C.purple, bytes(r.mem), bytes(r.memAll), hot(r.mem, r.memAll)),
    k.share('net', '⇅', C.cyan, r.net === null ? '–' : bytes(r.net), bytes(r.netAll), r.net === null ? undefined : hot(r.net, r.netAll)),
    k.share('disk', '⛁', C.orchid, bytes(r.diskAll), ''),
    k.share('procs', '⑂', C.slate, String(r.procs), ''),
  ]
}

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
  /** The ✕ on a branch. */
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
  const { Box, Text, Button } = els
  const k = kit(els, 'desktop', d.columns)
  const a = d.activity
  const snap = d.snap
  const fold = (id: string) => ({ collapsed: d.collapsed.includes(id), onToggle: () => d.toggle(id) })

  // ---- the header: the session's totals ----
  const toolCalls = Object.values(a.tools).reduce((n, t) => n + t.n, 0)
  const toolErrors = Object.values(a.tools).reduce((n, t) => n + t.err, 0)
  const running = d.agents.filter(x => x.status === 'running' || x.status === 'pending').length
  // A figure over its dim label, four to a row.
  const metric = (key: string, value: string, label: string) => (
    <Box key={key} width="25%" flexDirection="column">
      <Text bold>{value}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  )
  const header = (
    <Box flexDirection="column">
      {running || toolErrors ? (
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} marginBottom={0.4}>
          {running ? <Text color={C.warn}>{`● ${running} agent${running === 1 ? '' : 's'} running`}</Text> : <Text color={C.ok}>● Idle</Text>}
          {toolErrors ? <Text color={C.bad}>{`${toolErrors} failed`}</Text> : null}
        </Box>
      ) : null}
      <Box flexDirection="row">
        {metric('time', a.startedAt ? short(d.at - a.startedAt) : '–', 'ELAPSED')}
        {metric('turns', String(a.turns), 'TURNS')}
        {metric('calls', String(toolCalls), 'CALLS')}
        {metric('files', String(a.files.length), 'FILES Δ')}
      </Box>
    </Box>
  )

  // ---- events: failed tool calls ----
  const failedTools = Object.entries(a.tools).filter(([, t]) => t.err > 0)
  const events = failedTools.length
    ? k.section({
        id: 'events',
        title: 'Events',
        right: <Text color={C.bad}>{`${toolErrors} failed`}</Text>,
        ...fold('events'),
        children: failedTools.map(([name, t]) =>
          k.prop(`ev-${name}`, name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name, <Text color={C.bad}>{`${t.err} of ${t.n} failed`}</Text>),
        ),
      })
    : null

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
        <Text dimColor>{`  ${tokens(snap.total)} / ${tokens(snap.max)}`}</Text>
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
            {/* The scale's figures: 0, a quarter, half, three quarters, the window. */}
            <Box flexDirection="row" justifyContent="space-between">
              {[0, 0.25, 0.5, 0.75, 1].map(f => (
                <Text key={`ax-${f}`} dimColor>
                  {f === 0 ? '0' : tokens(snap.max * f)}
                </Text>
              ))}
            </Box>
          </Box>,
          // The legend in two columns, each figure right-aligned in its column.
          <Box key="legend" flexDirection="row" flexWrap="wrap" marginTop={0.4} rowGap={0.1}>
            {parts.map((p, i) => (
              <Box key={`legend-${p.label}`} width="50%" flexDirection="row" alignItems="center" gap={0.5} paddingRight={i % 2 === 0 ? 1.5 : 0}>
                {k.swatch(p.color)}
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate">{p.label}</Text>
                </Box>
                <Text>{tokens(p.value)}</Text>
              </Box>
            ))}
          </Box>,
          <Box key="room" flexDirection="row" justifyContent="space-between" marginTop={0.4}>
            {snap.compactAt ? (
              <Text>
                <Text dimColor>COMPACTION </Text>
                <Text color={C.warn}>{tokens(snap.compactAt)}</Text>
              </Text>
            ) : (
              <Text dimColor>NO AUTO-COMPACT</Text>
            )}
            <Text>
              <Text dimColor>HEADROOM </Text>
              {tokens(Math.max(0, (snap.compactAt ?? snap.max) - snap.total))}
            </Text>
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
        color: C.slate,
        title: 'Limits',
        right: <Text dimColor>USED / RESET IN</Text>,
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

  // ---- turns: tool calls per turn, the peak in amber ----
  const turnsChart = () => {
    const log = a.turnLog.slice(-14)
    const first = a.turns - log.length + 1
    const calls = log.map(p => p.calls ?? 0)
    const peak = Math.max(0, ...calls)
    const at = calls.indexOf(peak)
    const num = (n: number) => String(n).padStart(2, '0')
    return [
      <Box key="sub" flexDirection="row" justifyContent="space-between">
        <Text dimColor>CALLS / TURN</Text>
        <Text>
          {String(peak)}
          <Text dimColor> PEAK</Text>
        </Text>
      </Box>,
      k.columns(
        calls.map((n, i) => [{ value: Math.max(n, 0.02 * Math.max(1, peak)), color: i === at && peak > 0 ? C.warn : C.blue }]),
        { slots: 14, height: 3 },
      ),
      <Box key="axis" flexDirection="row" justifyContent="space-between">
        <Text dimColor>{num(first)}</Text>
        {log.length > 2 ? <Text dimColor>{num(first + Math.floor(log.length / 2))}</Text> : null}
        <Text dimColor>{num(a.turns)}</Text>
      </Box>,
      peak > 0 ? (
        <Text key="peak" dimColor>
          {`Turn ${num(first + at)}: ${peak} calls, ${tokens(log[at]!.output)} out`}
        </Text>
      ) : null,
    ]
  }
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
        children: turnsChart(),
      })
    : null

  // ---- tools ----
  const allTools = Object.entries(a.tools).sort((x, y) => y[1].n - x[1].n)
  const toolMax = Math.max(1, ...allTools.map(([, t]) => t.n))
  // The top four, the rest folded under "Other tools".
  // `collapsed` holds the ids folded by toggling; for this row, toggled means opened.
  const otherOpen = d.collapsed.includes('tools-other')
  const toolRows = allTools.slice(0, otherOpen ? allTools.length : 4)
  const others = allTools.slice(4)
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
        children: [
          ...toolRows.map(([name, t]) =>
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
          others.length && Button ? (
            <Box key="other" flexDirection="row" justifyContent="space-between" gap={1}>
              <Button plain dimColor label={`${foldArrow(!otherOpen)} Other tools`} onPress={() => d.toggle('tools-other')} />
              <Text>{String(others.reduce((n, [, t]) => n + t.n, 0))}</Text>
            </Box>
          ) : null,
        ],
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

  // ---- accounting: what the session cost, and on what ----
  const accounting = k.section({
    id: 'accounting',
    title: 'Accounting',
    right: <Text>{a.cost !== undefined ? money(a.cost) : '–'}</Text>,
    ...fold('accounting'),
    children: [
      snap ? k.prop('model', 'Model', snap.model) : null,
      k.prop('cost', 'Cost', a.cost !== undefined ? money(a.cost) : 'not tracked here'),
    ],
  })

  return k.pinned(
    [header, events, context, limits, turns, tools, agents, ...renderBranches(els, k, d, fold), accounting],
    k.perf(d.perf, { lead: machine(k, d.resources) }),
    d.rows,
  )
}

/** A PR's state as one colour: merged purple, closed or draft grey, else by its checks. */
const prColor = (pr: GitPr) =>
  pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : pr.checks.failed ? C.bad : pr.checks.pending ? C.warn : C.ok

/**
 * Workspaces: the branches the session started, as the desktop app tracks them.
 * Each entry is two lines: the branch, its lines changed and its state; then
 * where it lives or its PR, its uncommitted changes, and CI, with Create PR,
 * Merge and hide as the actions.
 */
const renderBranches = (els: AppElements, k: ReturnType<typeof kit>, d: DesktopData, fold: (id: string) => { collapsed: boolean; onToggle: () => void }): RenderElement[] => {
  const { Box, Text, Link, Button } = els
  const entries = d.branches.map((b, i) => {
    const pr = b.pr
    const open = pr?.state === 'OPEN'
    const color = pr ? prColor(pr) : C.slate
    const id = `branch-${b.branch}`
    // Git-prompt marks: ! conflicted, + staged, ~ modified, ? untracked, ↑ ahead, ↓ behind.
    const state: [number, string, string][] = [
      [b.conflicted, '!', C.bad],
      [b.staged, '+', C.ok],
      [b.modified, '~', C.warn],
      [b.untracked, '?', C.cyan],
      [b.ahead, '↑', C.ok],
      [b.behind, '↓', C.warn],
    ]
    const creatable = !pr && b.exists
    // One row, before and after the PR opens: on the left where the branch lives, or
    // its PR once it has one; on the right its changes, then Create PR or the CI.
    const checks = pr && open ? (
      <Box flexDirection="row" gap={1}>
        {/* Git-prompt style, like the changes: =passed, !failed, *pending. */}
        {pr.checks.passed ? <Text key="ok" color={C.ok}>{`=${pr.checks.passed}`}</Text> : null}
        {pr.checks.failed ? <Text key="bad" color={C.bad}>{`!${pr.checks.failed}`}</Text> : null}
        {pr.checks.pending ? <Text key="wait" color={C.warn}>{`*${pr.checks.pending}`}</Text> : null}
      </Box>
    ) : (
      <Text color={color}>{pr?.state === 'MERGED' ? 'merged' : pr?.state === 'CLOSED' ? 'closed' : ''}</Text>
    )
    const row = (
      <Box key="row" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" gap={1} flexShrink={1}>
          {pr ? (
            <Link href={pr.url} label={`#${pr.number}`} />
          ) : null}
          <Text wrap="truncate" dimColor>
            {pr ? pr.title : b.worktree ? `${b.place} (worktree)` : b.place}
          </Text>
          {!b.exists ? <Text dimColor>deleted</Text> : !pr && !b.pushed ? <Text dimColor>not pushed</Text> : null}
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          {state.filter(([n]) => n > 0).map(([n, glyph, c]) => (
            <Text key={`s-${glyph}`} color={c}>{`${glyph}${n}`}</Text>
          ))}
          {pr ? checks : null}
          {pr && open && !pr.isDraft && Button ? <Button key={`merge-${pr.number}`} plain label="Merge" onPress={() => d.mergePr(pr)} /> : null}
          {creatable && Button ? (
            d.creating === b.branch ? (
              <Text dimColor>creating PR…</Text>
            ) : (
              <Button key={`create-${b.branch}`} plain label="Create PR" onPress={() => d.createPr(b.branch)} />
            )
          ) : null}
        </Box>
      </Box>
    )
    const failing = pr && open && pr.failing.length ? (
      <Text key="failing" color={C.bad} wrap="truncate">
        {pr.failing.slice(0, 3).join(', ')}
      </Text>
    ) : null
    // The entry's first line: the branch, its lines changed, its state as one word.
    const word = !b.exists ? 'DELETED' : pr ? (pr.state === 'OPEN' ? (pr.isDraft ? 'DRAFT' : 'OPEN') : pr.state) : b.pushed ? 'NO PR' : 'LOCAL'
    const title = (
      <Box key="title" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" gap={0.5} flexShrink={1}>
          <Text color={color}>{GLYPH.branch}</Text>
          <Text wrap="truncate">{b.branch}</Text>
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          {b.insertions ? <Text color={C.ok}>{`+${b.insertions}`}</Text> : null}
          {b.deletions ? <Text color={C.bad}>{`−${b.deletions}`}</Text> : null}
          <Text color={color}>{word}</Text>
          {Button ? <Button key={`hide-${b.branch}`} plain dimColor label="hide" onPress={() => d.hideBranch(b.branch)} /> : null}
        </Box>
      </Box>
    )
    return (
      <Box key={id} flexDirection="column" marginTop={i === 0 ? 0 : 0.6}>
        {title}
        {row}
        {failing}
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
      color: C.slate,
      title: 'Workspaces',
      right: (
        <Box flexDirection="row" gap={1.5}>
          {openPrs ? <Text color={C.ok}>{`${openPrs} open`}</Text> : null}
          {merged ? <Text color={C.purple}>{`${merged} merged`}</Text> : null}
        </Box>
      ),
      ...fold('workspaces'),
      children: entries,
    }),
  ]
}

