/** A label as GitHub colours it. */
export type Label = { name: string; color: string }

/** A pull request linked to close an issue ("Closes #n"), with its state. */
export type LinkedPr = {
  number: number
  title: string
  url: string
  /** `OPEN`, `MERGED` or `CLOSED`; empty when it lives in another repository and wasn't read. */
  state: string
  isDraft: boolean
  /** GitHub can't merge it for conflicts with its base. */
  conflicting: boolean
  /** Checks failing, and still running. */
  failing: number
  pending: number
}

/** One open issue, slimmed to what the pane draws. */
export type Issue = {
  number: number
  title: string
  url: string
  author: string
  labels: Label[]
  assignees: string[]
  comments: number
  /** When it last changed (ms since epoch). */
  updatedAt: number
  /** The pull requests linked to close it. */
  prs: LinkedPr[]
}

/** The last `gh issue list`: the repository's open issues, newest change first. */
export type IssueList = {
  /** `owner/name`; empty when gh couldn't tell. */
  repo: string
  issues: Issue[]
  /** Whether there are more open issues than were read. */
  more: boolean
  /** When it was last read well (ms since epoch). */
  at: number
  /** Why there's nothing to show, when gh failed on the first read. */
  note?: string
  /** Why the last refresh failed, when these are the last-good issues kept through it. */
  failed?: string
}

declare module 'claude-code' {
  interface PluginState {
    issues: {
      list: IssueList | null
      /** Issues selected for a sprint, by number. */
      selected: number[]
      /** The title of the issue being added, while gh runs. */
      adding: string | null
      /** Whether gh is being read right now. */
      reading: boolean
      /** The issue the terminal's cursor is on (the one whose row holds the focus), by number. */
      cursor: number | null
    }
  }
}
