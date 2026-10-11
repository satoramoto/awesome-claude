import type { Elements, RenderElement } from 'claude-code'

import { ago } from '../kit/format'
import { C, MUTED } from '../kit/tokens'
import { EDGE, SPACE, kit } from '../kit/ui'

import type { Issue, IssueList, LinkedPr } from '../types'

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
 * The app surfaces: the repository as a plain line, a field to add an issue,
 * then a tile per issue.
 *
 *   [issue icon]  Title of the issue…           (bug) (refined)  #12
 *   [pr icon] #31 Title of a linked PR                    1 failing
 *   by someone                 [💬] 3  2d   Refine  Start  Select
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

  // Every line of a tile starts with the same icon column, as a section header's does,
  // so the title, each linked PR and the byline all start their text at one x.
  const lead = (key: string, icon: RenderElement | null) => (
    <Box key={key} width={2} flexShrink={0} flexDirection="row" alignItems="center">
      {icon}
    </Box>
  )

  const picked = (issue: Issue) => act.selected.includes(issue.number)
  const tile = (issue: Issue, i: number) => {
    const refined = issue.labels.some(l => l.name === REFINED)
    return (
      <Box key={`issue-${issue.number}`} width="100%" marginTop={i === 0 ? 0 : SPACE.block}>
        {k.tile(`tile-${issue.number}`, [
          // The title line, then a little room before the rest of the tile.
          <Box key="l1" width="100%" marginBottom={SPACE.block / 2}>
            {row(
              'title',
              [
                lead('i', k.icon('issue-opened', OPEN)),
                <Text key="t" wrap="truncate">
                  {issue.title}
                </Text>,
              ],
              // Its labels as GitHub pills, then its number; the title gives way to them.
              [...issue.labels.map(l => k.pill(`label-${l.name}`, l.name, l.color)), <Link key="n" href={issue.url} label={`#${issue.number}`} />],
            )}
          </Box>,
          // Each PR linked to close it, as the overview's workspaces draw one: its state in the icon's glyph and colour.
          ...issue.prs.map(pr =>
            row(
              `pr-${pr.number}`,
              [
                lead('i', k.icon(prIcon(pr), prColor(pr))),
                <Link key="n" href={pr.url} label={`#${pr.number}`} />,
                pr.title ? (
                  <Text key="t" dimColor wrap="truncate">
                    {pr.title}
                  </Text>
                ) : null,
              ],
              [prNote(Text, pr)],
            ),
          ),
          row(
            'l3',
            [
              lead('i', null),
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
              // Picks it for a sprint: the word turns blue and the tile takes the selected fill.
              picked(issue) ? (
                <Button key={`pick-${issue.number}`} plain onPress={() => act.toggle(issue)}>
                  <Text color={C.blue}>Selected</Text>
                </Button>
              ) : (
                <Button key={`pick-${issue.number}`} plain dimColor label="Select" onPress={() => act.toggle(issue)} />
              ),
            ],
          ),
        ], { selected: picked(issue) })}
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

  // One repository, so no foldable header: its name as a plain line, the counts on the right.
  const head = row('repo', [<Text key="r" dimColor wrap="truncate">{list.repo || 'Issues'}</Text>], [list.note ? null : k.summary([[open, 'open', OPEN], fresh ? [String(fresh), 'today'] : null])])
  return (
    <Box flexDirection="column" paddingLeft={EDGE.left} paddingRight={EDGE.right} marginTop={1}>
      <Box key="head" width="100%" marginBottom={SPACE.block}>
        {head}
      </Box>
      {body}
    </Box>
  )
}

/** A linked PR's icon: GitHub's for its state; unread (another repository), the open one. */
const prIcon = (pr: LinkedPr) => (pr.state === 'MERGED' ? 'pr-merged' : pr.state === 'CLOSED' ? 'pr-closed' : pr.isDraft ? 'pr-draft' : 'pr-open')

/** A linked PR's colour, as the overview's workspaces colour one: merged purple, closed or draft grey; open green, red on conflicts, amber while CI fails. */
const prColor = (pr: LinkedPr) =>
  pr.state === 'MERGED' ? C.purple : pr.state === 'CLOSED' || pr.isDraft || !pr.state ? MUTED : pr.conflicting ? C.bad : pr.failing ? C.warn : C.ok

/** What an open PR's checks say, on the right of its line. */
const prNote = (Text: AppElements['Text'], pr: LinkedPr): RenderElement | null => {
  if (pr.state !== 'OPEN') return null
  if (pr.conflicting) return <Text key="ci" color={C.bad}>conflicts</Text>
  if (pr.failing) return <Text key="ci" color={C.warn}>{`${pr.failing} failing`}</Text>
  if (pr.pending) return <Text key="ci" color={C.blue}>{`${pr.pending} pending`}</Text>
  return null
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
