/** A label as GitHub colours it. */
export type Label = { name: string; color: string }

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
}

/** The last `gh issue list`: the repository's open issues, newest change first. */
export type IssueList = {
  /** `owner/name`; empty when gh couldn't tell. */
  repo: string
  issues: Issue[]
  /** Whether there are more open issues than were read. */
  more: boolean
  /** When it was read (ms since epoch). */
  at: number
  /** Why there's nothing to show, when gh failed. */
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    issues: { list: IssueList | null }
  }
}
