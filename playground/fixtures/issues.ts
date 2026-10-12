// Sample states for the issues mod: its PluginState values, by scenario.
const now = Date.now()
const hour = 3_600_000
const day = 24 * hour

const url = (n: number) => `https://github.com/satoramoto/awesome-claude/issues/${n}`

type Pr = { number: number; title: string; url: string; state: string; isDraft: boolean; conflicting: boolean; failing: number; pending: number }
const pr = (number: number, title: string, extra: Partial<Pr> = {}): Pr => ({
  number,
  title,
  url: `https://github.com/satoramoto/awesome-claude/pull/${number}`,
  state: 'OPEN',
  isDraft: false,
  conflicting: false,
  failing: 0,
  pending: 0,
  ...extra,
})

const issue = (
  number: number,
  title: string,
  ageMs: number,
  extra: Partial<{ labels: { name: string; color: string }[]; assignees: string[]; comments: number; author: string; prs: Pr[] }> = {},
) => ({
  number,
  title,
  url: url(number),
  author: 'satoramoto',
  labels: [] as { name: string; color: string }[],
  assignees: [] as string[],
  comments: 0,
  updatedAt: now - ageMs,
  prs: [] as Pr[],
  ...extra,
})

export const busy = {
  list: {
    repo: 'satoramoto/awesome-claude',
    more: false,
    at: now,
    issues: [
      issue(24, 'Snapshot tests of what mods draw, so the bench and the app agree', 2 * hour, {
        labels: [{ name: 'tests', color: '#0e8a16' }],
        comments: 3,
        prs: [pr(31, 'Snapshot tests for the overview pane', { failing: 1 })],
      }),
      issue(23, 'Fold arrow is clipped in the desktop pane', 5 * hour, {
        labels: [{ name: 'bug', color: '#d73a4a' }, { name: 'desktop', color: '#1d76db' }],
        assignees: ['satoramoto'],
        prs: [pr(29, 'A minimum width for the fold arrow', { state: 'MERGED' }), pr(30, 'Small disclosure triangles', { isDraft: true })],
      }),
      issue(21, 'Workspaces: show which checks fail, not just how many', 3 * day, { labels: [{ name: 'overview', color: '#5319e7' }], comments: 1 }),
      issue(18, 'A pane for the open issues of the session’s repository, with a very long title that has to truncate', 12 * day, {
        labels: [{ name: 'enhancement', color: '#a2eeef' }],
        prs: [pr(27, 'issues: a pane with the open issues', { pending: 2 })],
      }),
      issue(9, 'Terminal: legends wrap at narrow widths', 70 * day, { author: 'someone-else', comments: 7 }),
    ],
  },
}

/** Two issues picked for a sprint, one refined. */
export const sprint = {
  ...busy,
  list: {
    ...busy.list,
    issues: busy.list.issues.map(i => (i.number === 21 ? { ...i, labels: [...i.labels, { name: 'refined', color: '#0e8a16' }] } : i)),
  },
  selected: [24, 21],
}

export const empty = { list: { repo: 'satoramoto/awesome-claude', more: false, at: now, issues: [] } }

export const noRepo = { list: { repo: '', more: false, at: now, issues: [], note: 'No GitHub repository for this session' } }

export const reading = { list: null }

/** A read under way, the last-good issues (4 minutes old) kept meanwhile. */
export const refreshing = { list: { ...busy.list, at: now - 4 * 60_000 }, reading: true }

/** The last read failed: the issues from 12 minutes ago kept, with why. */
export const refreshFailed = { list: { ...busy.list, at: now - 12 * 60_000, failed: 'error connecting to api.github.com' } }

/** The terminal's cursor on the second issue (drawn at full strength with the pane focused). */
export const cursor = { ...busy, cursor: 23 }
