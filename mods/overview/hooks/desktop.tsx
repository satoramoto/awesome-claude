import type { Elements, RenderElement } from 'claude-code'

import { bytes, duration, money, short, tokens } from '@kit/format'
import type { PerfSnapshot } from '@kit/perf'
import { C, GLYPH, MUTED, levelColor } from '@kit/tokens'
import { kit } from '@kit/ui'

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
    k.pinned([header, context, limits, turns, tools, agents, ...renderBranches(els, k, d, fold)], k.perf(d.perf, { lead: machine(k, d.resources) }), d.rows)
  )
}

/** A PR's state as one colour: merged purple, closed or draft grey, else by its checks. */
const prColor = (pr: GitPr) =>
  pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft ? MUTED : pr.checks.failed ? C.bad : pr.checks.pending ? C.warn : C.ok

/**
 * One section per branch the session started, as the desktop app tracks them:
 * the branch's changes against the default branch in the header, and below it
 * where it lives, its uncommitted state, and its PR with CI; Create PR when it
 * has none, ✕ to stop showing it.
 */
const renderBranches = (els: AppElements, k: ReturnType<typeof kit>, d: DesktopData, fold: (id: string) => { collapsed: boolean; onToggle: () => void }): RenderElement[] => {
  const { Box, Text, Link, Button } = els
  // A glyph and its figure, a small gap between (a leading space in Text is dropped).
  const mark = (key: string, glyph: string, color: string, figure: string, dim = false) => (
    <Box key={key} flexDirection="row" gap={0.3}>
      <Text color={color}>{glyph}</Text>
      <Text dimColor={dim}>{figure}</Text>
    </Box>
  )
  return d.branches.map(b => {
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
    const where = (
      <Box key="where" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" gap={1} flexShrink={1}>
          <Text dimColor wrap="truncate">
            {b.worktree ? `${b.place} (worktree)` : b.place}
          </Text>
          {!b.exists ? <Text dimColor>deleted</Text> : !b.pushed ? <Text dimColor>not pushed</Text> : null}
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          {state.filter(([n]) => n > 0).map(([n, glyph, c]) => (
            <Text key={`s-${glyph}`} color={c}>{`${glyph}${n}`}</Text>
          ))}
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
    const checks = pr && open ? (
      <Box flexDirection="row" gap={1}>
        {pr.checks.passed ? mark('ok', '✓', C.ok, String(pr.checks.passed)) : null}
        {pr.checks.failed ? mark('bad', '✕', C.bad, String(pr.checks.failed)) : null}
        {pr.checks.pending ? mark('wait', '◌', C.warn, String(pr.checks.pending)) : null}
      </Box>
    ) : (
      <Text color={color}>{pr?.state === 'MERGED' ? 'merged' : pr?.state === 'CLOSED' ? 'closed' : ''}</Text>
    )
    const prLine = pr ? (
      <Box key="pr" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" gap={1} flexShrink={1}>
          <Link href={pr.url} label={`#${pr.number}`} />
          <Text wrap="truncate" dimColor={!open || pr.isDraft}>
            {pr.title}
          </Text>
        </Box>
        {checks}
      </Box>
    ) : null
    const failing = pr && open && pr.failing.length ? (
      <Text key="failing" color={C.bad} wrap="truncate">
        {pr.failing.slice(0, 3).join(', ')}
      </Text>
    ) : null
    return k.section({
      id,
      icon: GLYPH.branch,
      color,
      title: b.branch,
      right: (
        <Box flexDirection="row" gap={1} alignItems="center">
          {b.insertions ? <Text color={C.ok}>{`+${b.insertions}`}</Text> : null}
          {b.deletions ? <Text color={C.bad}>{`−${b.deletions}`}</Text> : null}
          {Button ? <Button key={`hide-${b.branch}`} plain dimColor label="hide" onPress={() => d.hideBranch(b.branch)} /> : null}
        </Box>
      ),
      ...fold(id),
      children: [where, prLine, failing],
    })
  })
}

