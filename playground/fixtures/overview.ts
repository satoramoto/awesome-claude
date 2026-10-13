// Sample states for the overview mod: its PluginState values, by scenario.
const now = Date.now()
const min = 60_000

const snapshot = (total: number, messages: number) => ({
  model: 'claude-opus-5-5',
  total,
  max: 200_000,
  percent: Math.round((total / 200_000) * 100),
  compactAt: 167_000,
  segments: [
    { name: 'System prompt', tokens: 3_100, kind: 'used' },
    { name: 'System tools', tokens: 14_200, kind: 'used' },
    { name: 'MCP tools', tokens: 6_400, kind: 'used' },
    { name: 'Memory files', tokens: 2_300, kind: 'used' },
    { name: 'Skills', tokens: 3_900, kind: 'used' },
    { name: 'Messages', tokens: messages, kind: 'used' },
    { name: 'Free space', tokens: Math.max(0, 200_000 - total - 33_000), kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, kind: 'buffer' },
  ],
  memory: [{ label: 'CLAUDE.md (User)', tokens: 1_400 }],
  mcp: [{ label: 'computer-use', tokens: 6_400 }],
  skills: [{ label: 'pdf', tokens: 200 }],
  agents: [],
})

const turnLog = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    ms: 9_000 + (i % 5) * 4_000,
    input: 800 + (i % 4) * 300,
    output: 600 + ((i * 7) % 5) * 500,
    cacheRead: 20_000 + i * 1_800,
    cacheWrite: i % 6 === 0 ? 9_000 : 1_200,
    calls: 2 + ((i * 5) % 9),
    tools: { Bash: 1 + (i % 4), Read: (i * 3) % 4, Edit: i % 3, Write: i % 5 === 0 ? 1 : 0, Agent: i % 7 === 0 ? 1 : 0 },
  }))

const branch = (b: Record<string, unknown>) => ({
  path: '/r',
  place: 'awesome-claude',
  worktree: false,
  exists: true,
  checkedOut: false,
  ahead: 0,
  behind: 0,
  insertions: 0,
  deletions: 0,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  pushed: true,
  pr: null,
  ...b,
})

const branches = [
  branch({ branch: 'dev', checkedOut: true, insertions: 412, deletions: 96, modified: 3, pr: { number: 9, title: 'A neater inspector', url: '#', state: 'OPEN', isDraft: false, review: '', checks: { passed: 2, failed: 1, pending: 0 }, failing: ['mods'], current: true } }),
  branch({ branch: 'kit-renderer', place: 'awesome-claude-kit', worktree: true, insertions: 120, deletions: 8, pr: { number: 8, title: 'Kit renderer', url: '#', state: 'MERGED', isDraft: false, review: '', checks: { passed: 1, failed: 0, pending: 0 }, failing: [], current: false } }),
  branch({ branch: 'fix/storybook-port', insertions: 4, deletions: 2, pushed: false }),
]

const git = {
  ok: true,
  root: '/r',
  repo: 'awesome-claude',
  branch: 'playground',
  detached: false,
  upstream: 'origin/playground',
  ahead: 2,
  behind: 0,
  worktree: { name: 'playground', path: '/r', linked: true, count: 2 },
  staged: 1,
  modified: 3,
  untracked: 1,
  conflicted: 0,
  insertions: 412,
  deletions: 96,
  files: [],
  fileCount: 5,
}

const gh = {
  root: '/r',
  at: now,
  prs: [
    { number: 6, title: 'A playground for mods', url: '#', state: 'OPEN', isDraft: false, review: '', checks: { passed: 2, failed: 1, pending: 1 }, failing: ['tests'], current: true },
    { number: 5, title: 'Crisp desktop layout from boxes and text', url: '#', state: 'MERGED', isDraft: false, review: 'APPROVED', checks: { passed: 3, failed: 0, pending: 0 }, failing: [], current: false },
  ],
}

export const busy = {
  snapshot: snapshot(61_000, 31_100),
  limits: [
    { kind: 'five_hour', percent: 42, resetsAt: new Date(now + 138 * min).toISOString() },
    { kind: 'seven_day', percent: 78, resetsAt: new Date(now + 76 * 60 * min).toISOString() },
  ],
  agents: [
    { id: 'a', description: 'Explore the render pipeline', type: 'Explore', status: 'completed' },
    { id: 'b', description: 'Lane: desktop layout', type: 'developer', status: 'running' },
    { id: 'c', description: 'Worker: legend bar', type: 'worker', status: 'running', parentId: 'b' },
    { id: 'e', description: 'Worker: tool icons', type: 'worker', status: 'running', parentId: 'b' },
    { id: 'd', description: 'Review the branch', type: 'reviewer', status: 'failed' },
    { id: 'f', description: 'Plan the kit split', type: 'Plan', status: 'running' },
    { id: 'g', description: 'Fix the CI version check', type: 'quick-fix', status: 'killed' },
    { id: 'h', description: 'Look up the hook API', type: 'claude-code-guide', status: 'running' },
    { id: 'i', description: 'Survey the issues', type: 'general-purpose', status: 'pending' },
    { id: 'j', description: 'Check the GitHub queue', type: 'triage-bot', status: 'running' },
  ],
  agentExtra: {
    a: { durationMs: 74_000, tokens: 41_000, doing: { kind: 'read', text: 'Reading', arg: 'kit/ui.tsx' } },
    b: { startedAt: now - 192_000, tokens: 88_000, doing: { kind: 'bash', text: 'Bash', arg: 'bun build.ts && bunx tsc -p plugins/overview' } },
    c: { startedAt: now - 40_000, doing: { kind: 'edit', text: 'Editing', arg: 'mods/overview/hooks/desktop.tsx' } },
    e: { startedAt: now - 22_000, doing: { kind: 'search', text: 'Searching', arg: 'describeCall' } },
    d: { durationMs: 12_000, tokens: 9_000 },
    f: { startedAt: now - 65_000, tokens: 12_000, doing: { kind: 'agent', text: 'Starting agent', arg: 'Map the kit exports' } },
    g: { durationMs: 8_000 },
    h: { startedAt: now - 15_000, doing: { kind: 'web', text: 'Fetching', arg: 'https://docs.claude.com/en/docs/claude-code/hooks' } },
    j: { startedAt: now - 9_000, doing: { kind: 'mcp', text: 'search_issues', arg: 'github' } },
  },
  git,
  gh,
  activity: {
    startedAt: now - 47 * min,
    cost: 4.82,
    turns: 23,
    tools: { Bash: { n: 41, err: 3 }, Read: { n: 33, err: 0 }, Edit: { n: 19, err: 1 }, Write: { n: 4, err: 0 }, Agent: { n: 4, err: 0 }, mcp__computer_use__screenshot: { n: 2, err: 0 } },
    files: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    turnLog: turnLog(23),
    contextLog: Array.from({ length: 23 }, (_, i) => Math.min(31, 9 + i)),
  },
  collapsed: [],
  branches,
  tracked: [],
  hidden: [],
  creating: null,
  resources: { procs: 6, cpu: 1.4, cpuAll: 18, mem: 612 * 1024 * 1024, memAll: 32 * 1024 ** 3, diskAll: 2_100_000, net: 3_100, netAll: 41_000 },
  now,
}

export const fresh = {
  snapshot: snapshot(24_000, 0),
  limits: [],
  agents: [],
  agentExtra: {},
  git: { ...git, ahead: 0, staged: 0, modified: 0, untracked: 0, insertions: 0, deletions: 0, worktree: { ...git.worktree, linked: false } },
  gh: { ...gh, prs: [] },
  activity: { startedAt: now - 1 * min, turns: 0, tools: {}, files: [], turnLog: [], contextLog: [] },
  collapsed: [],
  now,
}

export const nearLimit = {
  ...busy,
  snapshot: snapshot(184_000, 154_100),
  limits: [
    { kind: 'five_hour', percent: 96, resetsAt: new Date(now + 21 * min).toISOString() },
    { kind: 'seven_day', percent: 91, resetsAt: new Date(now + 18 * 60 * min).toISOString() },
  ],
  activity: { ...busy.activity, cost: 38.4, turns: 112, turnLog: turnLog(40) },
}
