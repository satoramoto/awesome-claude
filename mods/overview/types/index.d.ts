/** One category of the window, as /context lists it; `kind` as the engine stamps it. */
export type Segment = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }

/** One line item under a category (a memory file, an MCP server, a skill, an agent). */
export type Item = { label: string; tokens: number }

/** The breakdown, slimmed to what the band draws. */
export type Snapshot = {
  model: string
  total: number
  max: number
  percent: number
  compactAt?: number
  segments: Segment[]
  memory: Item[]
  mcp: Item[]
  skills: Item[]
  agents: Item[]
}

/** One subagent as `$.agent.list()` gives it, kept as plain data. */
export type Agent = {
  id: string
  description: string
  /** The agent definition (`general-purpose`, `Explore`, ...). */
  type: string
  /** `running`, `completed`, `failed`, `killed`, or another engine task status. */
  status: string
  /** The subagent that spawned it; absent when the main loop did. */
  parentId?: string
}

/** What the spawn and turn hooks saw of an agent beyond the list. */
export type AgentExtra = {
  /** When `agent.spawn` started it (ms since epoch). */
  startedAt?: number
  /** Summed `durationMs` of its finished turns. */
  durationMs?: number
  /** Summed tokens of its finished turns (input, output and cache). */
  tokens?: number
  /** `agent.spawn`'s `parentAgentId`: the loop that spawned it, for when the list leaves `parentId` out. */
  parentId?: string
}

/** One drawn row of the Tasks tree. */
export type TreeRow = {
  agent: Agent
  depth: number
  /** Last among its siblings: drawn with `└─` rather than `├─`. */
  last: boolean
  /** Per ancestor level 1..depth-1, whether that ancestor has later siblings (draw a `│` guide). */
  guides: boolean[]
  /** All its descendants, folded ones included. */
  descendants: number
  /** Of those, the ones still running or pending. */
  running: number
  /** Its finished subtree is folded into this row. */
  folded: boolean
}

/** One changed path from `git status --porcelain=v2`. */
export type GitFile = {
  path: string
  kind: 'conflict' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'modified'
  /** Only the index has the change (nothing left unstaged). */
  staged: boolean
}

/** The session's repo as the git section draws it. */
export type GitInfo = {
  ok: true
  /** `git rev-parse --show-toplevel` of the session cwd. */
  root: string
  repo: string
  /** Branch name, or the short commit when detached. */
  branch: string
  detached: boolean
  upstream?: string
  ahead: number
  behind: number
  worktree: { name: string; path: string; linked: boolean; count: number }
  staged: number
  modified: number
  untracked: number
  conflicted: number
  insertions: number
  deletions: number
  /** The first few changed paths. */
  files: GitFile[]
  /** Changed paths in all, beyond `files` too. */
  fileCount: number
}

/** Why there is no git section: not a repo, git missing. */
export type GitNote = { ok: false; note: string }

/** One pull request for the git section. */
export type GitPr = {
  number: number
  title: string
  url: string
  /** `OPEN`, `MERGED` or `CLOSED`. */
  state: string
  isDraft: boolean
  /** `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED` or empty. */
  review: string
  checks: { passed: number; failed: number; pending: number }
  /** Names of the failing checks. */
  failing: string[]
  /** The PR's head is the current branch. */
  current: boolean
}

/** The cached `gh` result, refreshed on a slower timer. */
export type GhInfo = {
  /** The repo root it was fetched for. */
  root: string
  prs: GitPr[]
  /** Why there are no PRs to show: gh missing, unauthenticated, no remote. */
  note?: string
  at: number
}

/** One account rate-limit window as the API last reported it. */
export type Limit = {
  /** `five_hour`, `seven_day`, a gateway's `spend_limit`, or another window the API names. */
  kind: string
  /** 0 to 100; past 100 on an exceeded spend limit. */
  percent: number
  /** ISO 8601 time the window resets. */
  resetsAt?: string
}

/** One tool's calls this session, and how many of them errored. */
export type ToolCount = { n: number; err: number }

/** One main-loop turn: how long it took and its tokens. */
export type TurnPoint = { ms: number; input: number; output: number; cacheRead: number; cacheWrite: number }

/** What the session has done, as the hooks saw it. */
export type Activity = {
  /** When the session's figures count from (ms since epoch); absent until the first usage read. */
  startedAt?: number
  /** US dollars so far; absent where the host keeps no cost ledger. */
  cost?: number
  /** Main-loop turns finished. */
  turns: number
  /** Calls per tool name, subagents' included. */
  tools: Record<string, ToolCount>
  /** Paths Edit, Write, MultiEdit and NotebookEdit touched, each once. */
  files: string[]
  /** The last main-loop turns, oldest first. */
  turnLog: TurnPoint[]
  /** The context window's percent at each measurement, oldest first. */
  contextLog: number[]
}

declare module 'claude-code' {
  interface PluginState {
    overview: {
      /** The account's rate-limit windows from the last usage read; null until the first. */
      limits: Limit[] | null
      /** The session cwd's git state; null until the first read. */
      git: GitInfo | GitNote | null
      /** The last `gh` read for that repo; null until the first. */
      gh: GhInfo | null
      snapshot: Snapshot | null
      /** The session's subagents from the last `$.agent.list()`. */
      agents: Agent[]
      /** Per agent id, what the spawn and turn hooks recorded. */
      agentExtra: Record<string, AgentExtra>
      /** The clock running agents' elapsed time is drawn against (ms since epoch). */
      now: number
      /** Cost, time, turns, tool calls and files: the session's activity. */
      activity: Activity
      /** The app mode's section ids the person folded. */
      collapsed: string[]
    }
  }
}
