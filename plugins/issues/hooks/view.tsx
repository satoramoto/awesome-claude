import type { Elements, RenderElement } from 'claude-code'

import { ago } from '../kit/format'
import { C, MUTED } from '../kit/tokens'
import { SPACE, kit } from '../kit/ui'

import type { Issue, IssueList } from '../types'

export type AppElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Link' | 'Button' | 'Svg'>
export type TermElements = Pick<Elements['terminal'], 'Box' | 'Text'>

/** Open issues are green, as GitHub draws them. */
const OPEN = C.ok

/** The header's figures: how many are open, and how many of those changed in the last day. */
const counts = (list: IssueList, at: number) => {
  const fresh = list.issues.filter(i => at - i.updatedAt < 86_400_000).length
  return { open: `${list.issues.length}${list.more ? '+' : ''}`, fresh }
}

/**
 * The app surfaces: one section, the repository as its title, a tile per issue.
 *
 *   [issue icon] Title of the issue                       #12
 *   ● bug ● ui   by someone                        [💬] 3  2d
 */
export const renderApp = (els: AppElements, list: IssueList | null, columns: number, at: number): RenderElement => {
  const { Box, Text, Link } = els
  const k = kit(els, 'desktop', columns)
  if (!list) return <Text dimColor>Reading issues…</Text>
  const { open, fresh } = counts(list, at)

  const row = (key: string, l: (RenderElement | null)[], r: (RenderElement | null)[]) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={SPACE.item} width="100%">
      <Box flexDirection="row" alignItems="center" gap={SPACE.pair} flexShrink={1} minWidth={0} overflow="hidden">
        {l}
      </Box>
      <Box flexDirection="row" alignItems="center" gap={SPACE.item} flexShrink={0}>
        {r}
      </Box>
    </Box>
  )

  const tile = (issue: Issue, i: number) => (
    <Box key={`issue-${issue.number}`} width="100%" marginTop={i === 0 ? 0 : SPACE.block}>
      {k.tile(`tile-${issue.number}`, [
        row('l1', [k.icon('issue-opened', OPEN), <Text key="t" wrap="truncate">{issue.title}</Text>], [<Link key="n" href={issue.url} label={`#${issue.number}`} />]),
        row(
          'l2',
          [
            // Labels as the legends draw keys: a dot in the label's colour, the name dim.
            ...issue.labels.map(l => (
              <Box key={`label-${l.name}`} flexDirection="row" gap={SPACE.pair} flexShrink={0}>
                {k.swatch(l.color)}
                <Text dimColor>{l.name}</Text>
              </Box>
            )),
            <Text key="by" dimColor wrap="truncate">
              {issue.assignees.length ? `→ ${issue.assignees.join(', ')}` : `by ${issue.author}`}
            </Text>,
          ],
          [
            issue.comments ? (
              <Box key="c" flexDirection="row" alignItems="center" gap={SPACE.pair}>
                {k.icon('comment', MUTED)}
                <Text dimColor>{String(issue.comments)}</Text>
              </Box>
            ) : null,
            <Text key="age" dimColor>
              {ago(at - issue.updatedAt)}
            </Text>,
          ],
        ),
      ])}
    </Box>
  )

  const body: RenderElement[] = list.note
    ? [<Text key="note" dimColor>{list.note}</Text>]
    : list.issues.length
      ? list.issues.map(tile)
      : [<Text key="none" dimColor>No open issues.</Text>]

  return k.section({
    id: 'issues',
    icon: 'issue-opened',
    title: list.repo || 'Issues',
    right: list.note ? null : k.summary([[open, 'open', OPEN], fresh ? [String(fresh), 'today'] : null]),
    children: body,
  })
}

/** The terminal: a line per issue, its number, title and age, cut to the pane's width. */
export const renderTerminal = (els: TermElements, list: IssueList | null, at: number): RenderElement => {
  const { Box, Text } = els
  if (!list) return <Text dimColor>Reading issues…</Text>
  if (list.note) return <Text dimColor>{list.note}</Text>
  const { open } = counts(list, at)
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{list.repo || 'Issues'}</Text>
        <Text dimColor>{`  ${open} open`}</Text>
      </Text>
      {list.issues.length ? null : <Text dimColor>No open issues.</Text>}
      {list.issues.map(issue => (
        <Box key={`issue-${issue.number}`} flexDirection="row" gap={1}>
          <Text color={OPEN}>{`#${issue.number}`}</Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate">{issue.title}</Text>
          </Box>
          <Text dimColor>{ago(at - issue.updatedAt)}</Text>
        </Box>
      ))}
    </Box>
  )
}
