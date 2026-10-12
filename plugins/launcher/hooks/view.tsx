import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import { basename } from '../kit/format'
import { C, GRAY, MUTED } from '../kit/tokens'
import { EDGE, SPACE, kit } from '../kit/ui'

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

/** Each state's word and colour: grey stopped, blue starting, green answering, red failed. */
export const LOOK: Record<Status, { word: string; color: string }> = {
  stopped: { word: 'stopped', color: MUTED },
  starting: { word: 'starting', color: C.blue },
  running: { word: 'running', color: C.ok },
  elsewhere: { word: 'running elsewhere', color: C.ok },
  failed: { word: 'failed', color: C.bad },
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
 * The pane, on every surface: the project as a plain line with how many answer,
 * then one foldable row per configuration.
 *
 *   ▶ app                 running  localhost:5173   Stop  Restart
 *   ▼ storybook           failed   :6006            Start
 *       command   npm --prefix app run storybook
 *       exit      1
 *       > storybook dev -p 6006
 *       Error: …
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
  const { Box, Text, Button, Link } = els
  const k = kit(els, surface, columns)
  const terminal = surface === 'terminal'
  if (!file) return <Text dimColor>Reading .claude/launch.json…</Text>
  if (file.note) {
    return (
      <Box flexDirection="column" paddingLeft={terminal ? 0 : EDGE.left} paddingRight={terminal ? 0 : EDGE.right} marginTop={1}>
        <Text dimColor wrap="truncate">{file.note}</Text>
      </Box>
    )
  }

  const all = file.configs.map(c => ({ c, s: serverOf(c, servers) }))
  const answering = all.filter(x => x.s.status === 'running' || x.s.status === 'elsewhere').length
  const failed = all.filter(x => x.s.status === 'failed').length

  const quiet = (key: string, label: string, onPress: () => void) => (
    <Button key={key} plain dimColor={terminal ? true : undefined} onPress={onPress}>
      {terminal ? label : <Text color={GRAY.mid}>{label}</Text>}
    </Button>
  )

  /** The row's right side: its state, where it answers (or its port), then what can be done to it. */
  const right = (c: LaunchConfig, s: Server) => {
    const look = LOOK[s.status]
    const up = s.status === 'running' || s.status === 'elsewhere'
    const mine = s.status === 'running' || s.status === 'starting'
    const canStart = s.status === 'stopped' || s.status === 'failed' || (s.status === 'elsewhere' && Boolean(c.autoPort))
    return (
      <Box key="right" flexDirection="row" alignItems="center" gap={SPACE.item} minWidth={0} flexShrink={1}>
        <Text key="state" color={look.color} wrap="truncate">
          {look.word}
        </Text>
        {up ? (
          <Link key={`url-${c.name}`} href={urlOf(s.port)} label={`localhost:${s.port}`}>
            <Text color={C.blue}>{`localhost:${s.port}`}</Text>
          </Link>
        ) : (
          <Text key="port" {...(terminal ? { dimColor: true } : { color: GRAY.mid })}>{`:${s.port}`}</Text>
        )}
        {canStart ? <Button key={`start-${c.name}`} plain label="Start" onPress={() => act.start(c.name)} /> : null}
        {mine ? <Button key={`stop-${c.name}`} plain label="Stop" onPress={() => act.stop(c.name)} /> : null}
        {mine ? quiet(`restart-${c.name}`, 'Restart', () => act.restart(c.name)) : null}
      </Box>
    )
  }

  /** Unfolded: what it runs, where, how it ended, then the tail of its output. */
  const details = (c: LaunchConfig, s: Server) => {
    const tail = s.log.slice(-(terminal ? TAIL.terminal : TAIL.app))
    return [
      k.prop(`command-${c.name}`, 'command', commandOf(c)),
      c.cwd ? k.prop(`cwd-${c.name}`, 'cwd', c.cwd) : null,
      s.status === 'elsewhere' ? (
        <Text key={`note-${c.name}`} dimColor wrap="truncate">
          {`Port ${s.port} answers, but this session didn't start it.`}
        </Text>
      ) : null,
      s.status === 'failed' && s.code !== null ? k.prop(`exit-${c.name}`, 'exit', <Text color={C.bad}>{String(s.code)}</Text>) : null,
      tail.length ? (
        <Box key={`log-${c.name}`} flexDirection="column" marginTop={terminal ? 0 : SPACE.block} minWidth={0}>
          {tail.map((line, i) => (
            <Text key={`log-${c.name}-${i}`} dimColor wrap="truncate">
              {line || ' '}
            </Text>
          ))}
        </Box>
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
      title: c.name,
      right: right(c, s),
      collapsed: !open.includes(c.name),
      onToggle: () => act.toggle(c.name),
      children: details(c, s),
    }),
  )

  const head = (
    <Box key="head" flexDirection="row" justifyContent="space-between" gap={SPACE.item} width="100%">
      <Box flexShrink={1} minWidth={0}>
        <Text {...(terminal ? { dimColor: true } : { color: GRAY.mid })} wrap="truncate">
          {`${basename(file.root) || file.root}/.claude/launch.json`}
        </Text>
      </Box>
      {k.summary([
        [String(answering), 'running', answering ? C.ok : undefined],
        failed ? [String(failed), 'failed', C.bad] : null,
      ])}
    </Box>
  )

  return (
    // The sections run the pane's full width, as the overview's do; the plain line sits on the body's edges.
    <Box flexDirection="column" marginTop={terminal ? 0 : 1}>
      <Box key="top" flexDirection="column" paddingLeft={terminal ? 0 : EDGE.left} paddingRight={terminal ? 0 : EDGE.right}>
        {head}
        {rows.length ? null : <Text dimColor>No configurations in .claude/launch.json.</Text>}
      </Box>
      {rows}
    </Box>
  )
}
