import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import { basename } from '@kit/format'
import { C, GRAY, MUTED } from '@kit/tokens'
import type { StatusKind } from '@kit/tokens'
import { CELLS, EDGE, SPACE, kit } from '@kit/ui'

import type { LaunchConfig, LaunchFile, Server, Status } from '../types'

/** What the pane draws with; the terminal's table has the same elements, Svg aside. */
export type PaneElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Link'> & Partial<Pick<Elements['desktop'], 'Svg'>>

/** What the pane's controls do; the hooks module runs them with its `$`. */
export type Actions = {
  start: (name: string) => void
  stop: (name: string) => void
  restart: (name: string) => void
  /** Unfolds a configuration's details and output, or folds them. */
  toggle: (name: string) => void
}

/**
 * Each state's word and colour: grey stopped, blue starting, green answering, red
 * failed; and the kit status that draws it on the terminal (its glyph in the same colour).
 */
export const LOOK: Record<Status, { word: string; color: string; kind: StatusKind }> = {
  stopped: { word: 'stopped', color: MUTED, kind: 'stopped' },
  starting: { word: 'starting', color: C.blue, kind: 'running' },
  running: { word: 'running', color: C.ok, kind: 'done' },
  elsewhere: { word: 'running elsewhere', color: C.ok, kind: 'done' },
  failed: { word: 'failed', color: C.bad, kind: 'failed' },
}

/** Where a server answers. */
export const urlOf = (port: number) => `http://localhost:${port}`

/** The command line a configuration runs, as one would type it. */
export const commandOf = (c: LaunchConfig) => [c.runtimeExecutable, ...c.runtimeArgs].map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')

/** A configuration not yet probed reads as stopped on its own port. */
const serverOf = (c: LaunchConfig, servers: Record<string, Server>): Server =>
  servers[c.name] ?? { status: 'stopped', port: c.port, log: [], code: null, startedAt: 0 }

/** How many output lines an unfolded row shows. */
const TAIL = { terminal: 10, app: 14 } as const

/** The terminal section's fold gutter, and the cells its title keeps before giving way (as `k.section` draws it). */
const GUTTER = 2
const TITLE_KEEPS = 12

/** Notes that mean something went wrong reading the file, rather than there being none. */
const isError = (note: string) => /^(Unreadable|Could not)/.test(note)

/**
 * How a terminal row's right side fits its width, from fullest to barest:
 * 0 the state's word and the full address; 1 the port alone; 2 the state's glyph
 * alone; 3 no address; 4 no Restart (it stays in `/launcher restart`).
 */
type Fit = 0 | 1 | 2 | 3 | 4

/**
 * The pane, on every surface: the project as a plain line with how many answer,
 * then one foldable row per configuration.
 *
 *   yahaha/.claude/launch.json          1 running  1 failed
 *
 *   ▸ app        ✓ running  localhost:5173  Stop  Restart
 *   ▾ storybook  ✕ failed  :6006  Start
 *     command    npm --prefix app run storybook
 *     exit       1
 *     > storybook dev -p 6006
 *     Error: …
 */
export const renderPane = (
  els: PaneElements,
  surface: RenderSurface,
  columns: number,
  file: LaunchFile | null,
  servers: Record<string, Server>,
  open: string[],
  act: Actions,
): RenderElement => {
  const { Box, Text, Link } = els
  const k = kit(els, surface, columns)
  const terminal = surface === 'terminal'
  if (!file) return terminal ? k.note('reading', 'Reading .claude/launch.json…', 'loading') : <Text dimColor>Reading .claude/launch.json…</Text>
  if (file.note) {
    return (
      <Box flexDirection="column" paddingLeft={terminal ? 0 : EDGE.left} paddingRight={terminal ? 0 : EDGE.right} marginTop={terminal ? 0 : 1}>
        {terminal ? (
          k.note('note', file.note, isError(file.note) ? 'error' : 'empty')
        ) : (
          <Text dimColor wrap="truncate">
            {file.note}
          </Text>
        )}
      </Box>
    )
  }

  const all = file.configs.map(c => ({ c, s: serverOf(c, servers) }))
  const answering = all.filter(x => x.s.status === 'running' || x.s.status === 'elsewhere').length
  const failed = all.filter(x => x.s.status === 'failed').length

  /**
   * One row: its title, and its right side (its state, where it answers or its
   * port, then what can be done to it). On the terminal the row has whole cells to
   * fill, so the right side gives up its least telling parts first, and the title
   * is cut to what's left: the kit's section would otherwise share the cut between them.
   */
  const row = (c: LaunchConfig, s: Server) => {
    const look = LOOK[s.status]
    const up = s.status === 'running' || s.status === 'elsewhere'
    const mine = s.status === 'running' || s.status === 'starting'
    const canStart = s.status === 'stopped' || s.status === 'failed' || (s.status === 'elsewhere' && Boolean(c.autoPort))
    const start = canStart ? { key: `start-${c.name}`, label: 'Start', onPress: () => act.start(c.name) } : null
    const stop = mine ? { key: `stop-${c.name}`, label: 'Stop', onPress: () => act.stop(c.name) } : null
    const restart = mine ? { key: `restart-${c.name}`, label: 'Restart', quiet: true, onPress: () => act.restart(c.name) } : null

    let fit: Fit = 0
    let title = c.name
    if (terminal) {
      const name = [...c.name]
      const width = (f: Fit) => {
        const parts = [
          f >= 2 ? 1 : 2 + look.word.length,
          f >= 3 ? null : f >= 1 || !up ? 1 + String(s.port).length : `localhost:${s.port}`.length,
          ...[start, stop, f >= 4 ? null : restart].filter(Boolean).map(a => a!.label.length),
        ].filter((n): n is number => n !== null)
        return parts.reduce((n, p) => n + p, 0) + CELLS.group * (parts.length - 1)
      }
      const room = columns - GUTTER - Math.min(name.length, TITLE_KEEPS) - CELLS.group
      while (fit < 4 && width(fit) > room) fit = (fit + 1) as Fit
      const titleRoom = Math.max(4, columns - GUTTER - CELLS.group - width(fit))
      if (name.length > titleRoom) title = `${name.slice(0, titleRoom - 1).join('')}…`
    }

    const buttons = [start, stop, fit >= 4 ? null : restart]
    const where = up ? (
      <Link key={`url-${c.name}`} href={urlOf(s.port)} label={fit >= 1 ? `:${s.port}` : `localhost:${s.port}`}>
        <Text {...k.ink(C.blue)} wrap="truncate">
          {fit >= 1 ? `:${s.port}` : `localhost:${s.port}`}
        </Text>
      </Link>
    ) : (
      <Text key="port" {...(terminal ? { dimColor: true } : { color: GRAY.mid })} wrap="truncate">{`:${s.port}`}</Text>
    )
    const right = (
      <Box key="right" flexDirection="row" alignItems="center" gap={terminal ? CELLS.group : SPACE.item} minWidth={0} flexShrink={1}>
        {terminal ? (
          k.status(look.kind, fit >= 2 ? undefined : look.word, 'state')
        ) : (
          <Text key="state" color={look.color} wrap="truncate">
            {look.word}
          </Text>
        )}
        {fit >= 3 ? null : where}
        {buttons.some(Boolean) ? k.actions(`actions-${c.name}`, buttons) : null}
      </Box>
    )
    return { title, right }
  }

  /** Unfolded: what it runs, where, how it ended, then the tail of its output. */
  const details = (c: LaunchConfig, s: Server) => {
    const tail = s.log.slice(-(terminal ? TAIL.terminal : TAIL.app))
    const elsewhere = `Port ${s.port} answers, but this session didn't start it.`
    return [
      k.prop(`command-${c.name}`, 'command', commandOf(c)),
      c.cwd ? k.prop(`cwd-${c.name}`, 'cwd', c.cwd) : null,
      s.status === 'elsewhere' ? (
        terminal ? (
          k.note(`note-${c.name}`, elsewhere)
        ) : (
          <Text key={`note-${c.name}`} dimColor wrap="truncate">
            {elsewhere}
          </Text>
        )
      ) : null,
      s.status === 'failed' && s.code !== null ? k.prop(`exit-${c.name}`, 'exit', <Text {...k.ink(C.bad)}>{String(s.code)}</Text>) : null,
      tail.length ? (
        <Box key={`log-${c.name}`} flexDirection="column" marginTop={terminal ? 0 : SPACE.block} minWidth={0}>
          {tail.map((line, i) =>
            terminal ? (
              k.note(`log-${c.name}-${i}`, line || ' ')
            ) : (
              <Text key={`log-${c.name}-${i}`} dimColor wrap="truncate">
                {line || ' '}
              </Text>
            ),
          )}
        </Box>
      ) : terminal ? (
        k.note(`log-${c.name}`, 'No output yet.')
      ) : (
        <Text key={`log-${c.name}`} dimColor>
          No output yet.
        </Text>
      ),
    ]
  }

  const rows: RenderElement[] = all.map(({ c, s }) =>
    k.section({
      id: c.name,
      ...row(c, s),
      collapsed: !open.includes(c.name),
      onToggle: () => act.toggle(c.name),
      children: details(c, s),
    }),
  )

  const path = `${basename(file.root) || file.root}/.claude/launch.json`
  const counts = k.summary([
    [String(answering), 'running', answering ? C.ok : undefined],
    failed ? [String(failed), 'failed', C.bad] : null,
  ])
  const empty = 'No configurations in .claude/launch.json.'

  if (terminal) {
    // The head line, one blank row, then the sections from the pane's left edge.
    return (
      <Box flexDirection="column">
        <Box key="top" flexDirection="column" marginBottom={1}>
          {k.item('head', { text: path, dim: true, right: [counts] })}
        </Box>
        {rows.length ? rows : k.note('empty', empty)}
      </Box>
    )
  }

  const head = (
    <Box key="head" flexDirection="row" justifyContent="space-between" gap={SPACE.item} width="100%">
      <Box flexShrink={1} minWidth={0}>
        <Text color={GRAY.mid} wrap="truncate">
          {path}
        </Text>
      </Box>
      {counts}
    </Box>
  )

  return (
    // The sections run the pane's full width, as the overview's do; the plain line sits on the body's edges.
    <Box flexDirection="column" marginTop={1}>
      <Box key="top" flexDirection="column" paddingLeft={EDGE.left} paddingRight={EDGE.right}>
        {head}
        {rows.length ? null : <Text dimColor>{empty}</Text>}
      </Box>
      {rows}
    </Box>
  )
}
