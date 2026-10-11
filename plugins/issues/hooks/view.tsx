import type { Elements, RenderElement } from 'claude-code'

import { ago } from '../kit/format'
import { C, MUTED } from '../kit/tokens'
import { SPACE, kit } from '../kit/ui'

import type { Issue, IssueList } from '../types'

/** The app surfaces' elements; `Input` only where the surface draws fields (not mobile). */
export type AppElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Link' | 'Button' | 'Svg'> & Partial<Pick<Elements['desktop'], 'Input'>>
export type TermElements = Pick<Elements['terminal'], 'Box' | 'Text'>

/** Open issues are green, as GitHub draws them. */
const OPEN = C.ok

/** The header's figures: how many are open, and how many of those changed in the last day. */
const counts = (list: IssueList, at: number) => {
  const fresh = list.issues.filter(i => at - i.updatedAt < 86_400_000).length
  return { open: `${list.issues.length}${list.more ? '+' : ''}`, fresh }
}

/** The label an issue gets once refined; Start asks to refine first without it. */
export const REFINED = 'refined'

/** What the pane's controls do; the hooks module runs them with its `$`. */
export type Actions = {
  /** Opens an issue with this title. */
  add: (title: string) => void
  refine: (issue: Issue) => void
  start: (issue: Issue) => void
  /** Adds an issue to the sprint selection, or takes it out. */
  toggle: (issue: Issue) => void
  clear: () => void
  /** Hands every selected issue to the session as one sprint. */
  sprint: () => void
  /** The issues selected for a sprint, by number. */
  selected: number[]
  /** The title being added, while gh runs. */
  adding: string | null
  /** Changes after each add, so the field comes back empty. */
  formKey: number
}

/**
 * The app surfaces: one section, the repository as its title, a field to add an
 * issue, then a tile per issue.
 *
 *   [issue icon] Title of the issue                       #12
 *   ● bug ● refined
 *   by someone                     [💬] 3  2d   Refine  Start
 */
export const renderApp = (els: AppElements, list: IssueList | null, columns: number, at: number, act: Actions): RenderElement => {
  const { Box, Text, Link, Button, Input } = els
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

  const picked = (issue: Issue) => act.selected.includes(issue.number)
  const tile = (issue: Issue, i: number) => {
    const refined = issue.labels.some(l => l.name === REFINED)
    return (
      <Box key={`issue-${issue.number}`} width="100%" marginTop={i === 0 ? 0 : SPACE.block}>
        {k.tile(`tile-${issue.number}`, [
          row(
            'l1',
            [
              // The sprint checkbox, in the icon's place: pressed, the issue joins the selection.
              <Button key={`pick-${issue.number}`} plain dimColor={!picked(issue)} label={picked(issue) ? '☑' : '☐'} onPress={() => act.toggle(issue)} />,
              k.icon('issue-opened', OPEN),
              <Text key="t" wrap="truncate">
                {issue.title}
              </Text>,
            ],
            [<Link key="n" href={issue.url} label={`#${issue.number}`} />],
          ),
          // Every label on a line of its own, as the legends draw keys: a dot in its colour, the name dim.
          issue.labels.length
            ? row(
                'labels',
                issue.labels.map(l => (
                  <Box key={`label-${l.name}`} flexDirection="row" alignItems="center" gap={SPACE.pair} flexShrink={0}>
                    {k.swatch(l.color)}
                    <Text dimColor>{l.name}</Text>
                  </Box>
                )),
                [],
              )
            : null,
          row(
            'l3',
            [
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
              // Refine until it's refined; Start always (it asks to refine first when it isn't).
              refined ? null : <Button key={`refine-${issue.number}`} plain dimColor label="Refine" onPress={() => act.refine(issue)} />,
              <Button key={`start-${issue.number}`} plain label="Start" onPress={() => act.start(issue)} />,
            ],
          ),
        ])}
      </Box>
    )
  }

  // Quick add: a title and Enter opens the issue; the field comes back empty.
  const form = Input ? (
    <Box key="add" width="100%" marginBottom={SPACE.block}>
      {act.adding ? (
        <Text dimColor wrap="truncate">{`Adding “${act.adding}”…`}</Text>
      ) : (
        <Input key={`new-issue-${act.formKey}`} placeholder="New issue title" submitLabel="add" onSubmit={(title: string) => act.add(title)} />
      )}
    </Box>
  ) : null

  // Once anything is selected: how many, Clear, and Sprint, which hands them all over at once.
  const chosen = list.issues.filter(picked).length
  const bar =
    chosen ? (
      <Box key="sprint" width="100%" marginBottom={SPACE.block}>
        {row(
          'sprint-row',
          [<Text key="n">{`${chosen} selected`}</Text>],
          [<Button key="clear" plain dimColor label="Clear" onPress={() => act.clear()} />, <Button key="go" plain label={`Sprint (${chosen})`} onPress={() => act.sprint()} />],
        )}
      </Box>
    ) : null

  const body: (RenderElement | null)[] = list.note
    ? [<Text key="note" dimColor>{list.note}</Text>]
    : [form, bar, ...(list.issues.length ? list.issues.map(tile) : [<Text key="none" dimColor>No open issues.</Text>])]

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
