import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import { basename, bytes } from '@kit/format'
import { C, GRAY, MUTED, STATUS } from '@kit/tokens'
import type { StatusKind } from '@kit/tokens'
import { CELLS, EDGE, SPACE, kit } from '@kit/ui'
import type { RightPart } from '@kit/ui'

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

/**
 * The terminal section's fold gutter, the cells of title a row keeps before its
 * right side gives up parts, and the section header's gaps around its rule.
 */
const GUTTER = 2
const TITLE_KEEPS = 12
const RULE_GAPS = 2

/** The cells of a running server's CPU sparkline on the terminal: the last 12 samples. */
const SPARK_CELLS = 6
/** The CPU percent a sparkline's top stands for at least, so an idle server's noise stays low. */
const SPARK_FLOOR = 10

/**
 * What a terminal row's right side gives up first as it narrows (`RightPart.drop`,
 * the highest first): the CPU sparkline, then the state's word, then the address,
 * then Restart (it stays in `/launcher restart`). The address shortens to its
 * port before any of them but the sparkline goes.
 */
const DROP = { spark: 4, word: 3, address: 2, restart: 1 } as const

/** Notes that mean something went wrong reading the file, rather than there being none. */
const isError = (note: string) => /^(Unreadable|Could not)/.test(note)

const cells = (s: string) => [...s].length

/** A CPU sample as a figure: a tenth under 10% (an idle server's 0.3%), whole above. */
const percent = (cpu: number) => `${cpu < 10 ? cpu.toFixed(1).replace(/\.0$/, '') : Math.round(cpu)}%`

/**
 * The pane, on every surface: the project as a plain line with how many answer,
 * then one foldable row per configuration.
 *
 *   yahaha/.claude/launch.json          1 running  1 failed
 *
 *   ▸ app ───── ✓ running  localhost:5173  ⣀⣤⣶  Stop  Restart
 *   ▾ storybook ───────────────── ✕ failed  :6006  Start
 *     command    npm --prefix app run storybook
 *     exit       1
 *     > storybook dev -p 6006
 *     Error: …
 *
 * `focused` is whether the pane has the keyboard (`e.props.isFocused`). The
 * launcher binds no keys of its own (its controls are buttons), so it draws no
 * key hints.
 */
export const renderPane = (
  els: PaneElements,
  surface: RenderSurface,
  columns: number,
  file: LaunchFile | null,
  servers: Record<string, Server>,
  open: string[],
  act: Actions,
  opts: { focused?: boolean } = {},
): RenderElement => {
  const { Box, Text, Link } = els
  const k = kit(els, surface, columns, { focused: opts.focused })
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
   * One row's right side (its state, where it answers or its port, then what can
   * be done to it). On the terminal it's a kit `item` whose text is the state's
   * glyph and whose right parts carry `DROP` ranks, sized to the room the title
   * leaves, so it gives up its least telling parts first; the section
   * (`keepRight`) then keeps it whole and cuts the title to what's left.
   */
  const row = (c: LaunchConfig, s: Server) => {
    const look = LOOK[s.status]
    const up = s.status === 'running' || s.status === 'elsewhere'
    const mine = s.status === 'running' || s.status === 'starting'
    const canStart = s.status === 'stopped' || s.status === 'failed' || (s.status === 'elsewhere' && Boolean(c.autoPort))
    const start = canStart ? { key: `start-${c.name}`, label: 'Start', onPress: () => act.start(c.name) } : null
    const stop = mine ? { key: `stop-${c.name}`, label: 'Stop', onPress: () => act.stop(c.name) } : null
    const restart = mine ? { key: `restart-${c.name}`, label: 'Restart', quiet: true, onPress: () => act.restart(c.name) } : null

    const where = (label: string) =>
      up ? (
        <Link key={`url-${c.name}`} href={urlOf(s.port)} label={label}>
          <Text {...k.ink(C.blue)} wrap="truncate">
            {label}
          </Text>
        </Link>
      ) : (
        <Text key="port" {...(terminal ? { dimColor: true } : { color: GRAY.mid })} wrap="truncate">{`:${s.port}`}</Text>
      )

    if (terminal) {
      const status = STATUS[look.kind]
      const full = up ? `localhost:${s.port}` : `:${s.port}`
      const main = [start, stop].filter(a => a !== null)
      const mainCells = main.reduce((n, a) => n + cells(a.label), 0) + CELLS.group * Math.max(0, main.length - 1)
      const room = Math.max(1, columns - GUTTER - Math.min(cells(c.name), TITLE_KEEPS) - RULE_GAPS)
      // The address shortens to its port first: the full one only while the whole row
      // fits with it (a sparkline aside, which goes before it).
      const whole =
        1 +
        CELLS.item +
        cells(look.word) +
        CELLS.group +
        cells(full) +
        (main.length ? CELLS.group + mainCells : 0) +
        (restart ? CELLS.group + cells(restart.label) : 0)
      const address = whole <= room ? full : `:${s.port}`
      // Parts after the word sit a group apart, as the actions in a cluster do: the
      // item puts one cell between parts, and each brings one more of its own.
      const spaced = (key: string, part: RenderElement, n: number, drop?: number): RightPart => ({
        part: (
          <Box key={key} flexDirection="row" paddingLeft={CELLS.group - CELLS.item}>
            {part}
          </Box>
        ),
        cells: n + CELLS.group - CELLS.item,
        ...(drop ? { drop } : {}),
      })
      const cpu = up && s.cpu && s.cpu.length >= 2 ? s.cpu : null
      const parts: (RightPart | null)[] = [
        {
          part: (
            <Box key={`word-${c.name}`} flexDirection="row" minWidth={0}>
              <Text {...k.ink(status.color)} wrap="truncate">
                {look.word}
              </Text>
            </Box>
          ),
          cells: cells(look.word),
          drop: DROP.word,
        },
        spaced(`where-${c.name}`, where(address), cells(address), DROP.address),
        cpu ? spaced(`spark-${c.name}`, k.spark(cpu, { width: SPARK_CELLS, max: Math.max(SPARK_FLOOR, ...cpu) }), SPARK_CELLS, DROP.spark) : null,
        main.length ? spaced(`main-${c.name}`, k.actions(`actions-${c.name}`, main), mainCells) : null,
        restart ? spaced(`more-${c.name}`, k.actions(`actions-restart-${c.name}`, [restart]), cells(restart.label), DROP.restart) : null,
      ]
      const right = k.item(`right-${c.name}`, { text: status.glyph, textColor: status.color, right: parts, width: room })
      return { title: c.name, right }
    }

    const right = (
      <Box key="right" flexDirection="row" alignItems="center" gap={SPACE.item} minWidth={0} flexShrink={1}>
        <Text key="state" color={look.color} wrap="truncate">
          {look.word}
        </Text>
        {where(up ? `localhost:${s.port}` : `:${s.port}`)}
        {start || stop || restart ? k.actions(`actions-${c.name}`, [start, stop, restart]) : null}
      </Box>
    )
    return { title: c.name, right }
  }

  /** Unfolded: what it runs, where, how it ended, then the tail of its output. */
  const details = (c: LaunchConfig, s: Server) => {
    const tail = s.log.slice(-(terminal ? TAIL.terminal : TAIL.app))
    const elsewhere = `Port ${s.port} answers, but this session didn't start it.`
    return [
      k.prop(`command-${c.name}`, 'command', commandOf(c)),
      c.cwd ? k.prop(`cwd-${c.name}`, 'cwd', c.cwd) : null,
      // On the terminal, what the header's sparkline last measured, as figures.
      terminal && s.cpu?.length ? k.prop(`cpu-${c.name}`, 'cpu', percent(s.cpu[s.cpu.length - 1]!)) : null,
      terminal && s.cpu?.length && s.rss ? k.prop(`memory-${c.name}`, 'memory', `${bytes(s.rss)}B`) : null,
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
      keepRight: true,
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
