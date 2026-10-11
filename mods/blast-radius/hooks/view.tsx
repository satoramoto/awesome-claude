// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Modified in the awesome-claude fork (2026): this file is new. It holds
// upstream's `draw()` from blast-radius.mjs as `renderTerminal`, unchanged, and
// adds `renderApp`, a desktop drawing of the same report built with the kit.

import type { Elements, RenderElement } from 'claude-code'

import { C, GRAY } from '@kit/tokens'
import { EDGE, SPACE, kit } from '@kit/ui'

/** What a risky command is, from the classifier. */
export type Risk = {
  kind: 'rm' | 'git-reset' | 'git-clean' | 'git-push-force' | 'git-checkout' | 'migrate'
  label: string
  dir: string | null
  targets?: string[]
  args?: string[]
  tool?: string
}

/** What the command would change, as measured: { summary, lines, more, note }. */
export type Report = { summary: string; lines: string[]; more?: number; note?: string }

/** The call being held, which the buttons answer. */
export type Held = {
  command: string
  risk: Risk
  report: Report | null
  decision: string | null
  where: 'pane' | 'band'
}

export type AppElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'> & Partial<Pick<Elements['desktop'], 'Code'>>

/** The buttons answer the call this drawing was made for, never whichever one is held now. */
const decider = (state: Held) => (choice: string) => () => {
  if (state.decision === null) {
    state.decision = choice
  }
}

/** The terminal: upstream's drawing, as it was. */
export function renderTerminal(t: any, state: Held): RenderElement {
  const { Box, Text, Button } = t
  const report = state.report!
  const list = report.lines.map((line, i) => Text({ key: `l${i}`, children: `  ${line}`, wrap: 'truncate-end' }))
  if (report.more) {
    list.push(Text({ key: 'more', dimColor: true, children: `  + ${report.more} more` }))
  }
  // The buttons answer the call this pane was drawn for, never whichever one is held now.
  const decide = decider(state)
  return Box({
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: 'yellow',
    paddingX: 1,
    children: [
      Text({ key: 'title', bold: true, color: 'yellow', children: `⚠ Blast Radius · ${state.risk.label}` }),
      Text({ key: 'cmd', children: [Text({ dimColor: true, children: 'Command  ' }), Text({ bold: true, children: state.command })], wrap: 'truncate-end' }),
      Text({ key: 'sum', children: [Text({ dimColor: true, children: 'Would    ' }), Text({ color: 'red', bold: true, children: report.summary })] }),
      Box({ key: 'list', flexDirection: 'column', marginTop: 1, children: list }),
      report.note ? Text({ key: 'note', dimColor: true, italic: true, children: report.note, wrap: 'wrap' }) : null,
      Box({
        key: 'buttons',
        marginTop: 1,
        gap: 2,
        children: [
          Button({ key: 'proceed', label: 'Proceed', hotkey: '1', plain: true, onPress: decide('proceed') }),
          Button({ key: 'cancel', label: 'Cancel', hotkey: '2', plain: true, autoFocus: true, onPress: decide('cancel') }),
          Text({ key: 'hint', dimColor: true, children: 'Claude is waiting on your answer' }),
        ],
      }),
    ],
  })
}

/** The icon beside the summary: what kind of loss it is. */
const SUMMARY_ICON: Record<Risk['kind'], string> = {
  rm: 'trash',
  'git-clean': 'trash',
  'git-reset': 'trash',
  'git-checkout': 'trash',
  'git-push-force': 'repo-push',
  migrate: 'arrow-up',
}

/** A summary that says nothing would be lost isn't drawn in red. */
export const harmless = (summary: string) => /\bnothing\b|drops no commits/.test(summary)

/** One listed line, split for the desktop: its icon, a grey mark before the text, the text, a grey mark after. */
const item = (kind: Risk['kind'], line: string): { icon: string; before?: string; text: string; after?: string } => {
  if (kind === 'git-push-force') {
    const space = line.indexOf(' ')
    return space > 0 ? { icon: 'git-commit', before: line.slice(0, space), text: line.slice(space + 1) } : { icon: 'git-commit', text: line }
  }
  if (kind === 'git-reset' || kind === 'git-checkout') {
    // `XY path`, as the terminal shows it: the status letters go to the right.
    return { icon: 'file', text: line.slice(3), after: line.slice(0, 2).trim() }
  }
  if (kind === 'migrate') return { icon: 'arrow-up', text: line }
  return { icon: line.endsWith('/') ? 'folder' : 'file', text: line }
}

/**
 * The app surfaces (desktop, VS Code, mobile), in the band or a pane:
 *
 *   [alert] rm -rf                                  (Blast Radius, in the band)
 *   rm -rf build                                    (the command, as code)
 *   [trash] delete 1284 files (about 46 MB)         (red)
 *   [file]  build/index.html
 *           + 1274 more
 *   Paths: build                                    (grey)
 *   [Proceed] [Cancel]  Claude is waiting on your answer
 */
export const renderApp = (els: AppElements, state: Held, columns: number, opts: { band?: boolean } = {}): RenderElement => {
  const { Box, Text, Button, Code } = els
  const k = kit(els, 'desktop', columns)
  const report = state.report!
  const { kind } = state.risk
  const decide = decider(state)

  // Every line starts with the same icon column, so text starts at one x.
  const lead = (icon: RenderElement | null) => (
    <Box key="lead" width={2} flexShrink={0} flexDirection="row" alignItems="center">
      {icon}
    </Box>
  )
  const row = (key: string, l: (RenderElement | null)[], r: (RenderElement | null)[] = [], marginTop = 0) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={SPACE.item} width="100%" minWidth={0} marginTop={marginTop}>
      <Box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden">
        {l}
      </Box>
      {r.length ? (
        <Box flexDirection="row" alignItems="center" gap={SPACE.item} flexShrink={0}>
          {r}
        </Box>
      ) : null}
    </Box>
  )

  const loss = harmless(report.summary) ? undefined : C.bad
  const lines = report.lines.map((line, i) => {
    const it = item(kind, line)
    return row(
      `l${i}`,
      [
        lead(k.icon(it.icon, GRAY.dark)),
        it.before ? (
          <Box key="b" flexShrink={0} marginRight={SPACE.pair}>
            <Text color={GRAY.mid}>{it.before}</Text>
          </Box>
        ) : null,
        <Text key="t" wrap="truncate">
          {it.text}
        </Text>,
      ],
      it.after ? [<Text key="a" color={GRAY.mid}>{it.after}</Text>] : [],
    )
  })

  return (
    <Box flexDirection="column" width="100%" minWidth={0} paddingLeft={EDGE.left} paddingRight={EDGE.right} marginTop={1}>
      {row(
        'head',
        [
          lead(k.icon('alert', C.warn)),
          <Text key="t" bold wrap="truncate">
            {state.risk.label}
          </Text>,
        ],
        opts.band ? [<Text key="who" color={GRAY.dark}>Blast Radius</Text>] : [],
      )}
      <Box key="cmd" width="100%" minWidth={0} marginTop={SPACE.block}>
        {Code ? (
          <Code source={state.command} language="bash" wrap="truncate-end" />
        ) : (
          <Text wrap="truncate">{state.command}</Text>
        )}
      </Box>
      {row(
        'sum',
        [
          lead(k.icon(SUMMARY_ICON[kind], loss ?? GRAY.dark)),
          <Text key="t" color={loss} wrap="truncate">
            {report.summary}
          </Text>,
        ],
        [],
        SPACE.block,
      )}
      {lines.length || report.more ? (
        <Box key="list" flexDirection="column" width="100%" minWidth={0} marginTop={SPACE.block / 2}>
          {lines}
          {report.more
            ? row('more', [
                lead(null),
                <Text key="t" color={GRAY.mid} wrap="truncate">
                  {`+ ${report.more} more`}
                </Text>,
              ])
            : null}
        </Box>
      ) : null}
      {report.note ? (
        <Box key="note" width="100%" minWidth={0} marginTop={SPACE.block}>
          <Text color={GRAY.mid} wrap="wrap">
            {report.note}
          </Text>
        </Box>
      ) : null}
      <Box key="buttons" flexDirection="row" alignItems="center" gap={SPACE.item} width="100%" minWidth={0} marginTop={SPACE.block * 1.5}>
        {/* Proceed runs the command: its label in red, the colour of what it would destroy. */}
        <Button key="proceed" label="Proceed" hotkey="1" onPress={decide('proceed')}>
          <Text color={C.bad}>Proceed</Text>
        </Button>
        {/* Cancel is the main button and holds the focus, so Enter refuses. */}
        <Button key="cancel" label="Cancel" hotkey="2" variant="primary" autoFocus onPress={decide('cancel')} />
        <Box key="hint" flexShrink={1} minWidth={0}>
          <Text color={GRAY.mid} wrap="truncate">
            Claude is waiting on your answer
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
