// Sample states for the filetree mod (a fork, see mods/filetree/README.md): its
// PluginState values, by scenario. Paths are absolute, as the mod keeps them.
const now = Date.now()
const min = 60_000
const day = 24 * 60 * min

const ROOT = '/Users/you/Code/acme/web'

type Kind = 'dir' | 'file' | 'link'
const node = (path: string, kind: Kind, ageMs: number, size = 0) => {
  const id = `${ROOT}/${path}`
  const name = path.split('/').pop()!
  return { id, parent: id.slice(0, id.lastIndexOf('/')), name, kind, hidden: name.startsWith('.'), mtime: now - ageMs, size, loaded: kind !== 'dir' || OPEN.includes(path) }
}

/** The folders drawn open. */
const OPEN = ['src', 'src/components', 'src/lib']

const nodes = [
  node('.github', 'dir', 30 * day),
  node('node_modules', 'dir', 2 * day),
  node('public', 'dir', 12 * day),
  node('src', 'dir', 5 * min),
  node('src/components', 'dir', 5 * min),
  node('src/components/Button.tsx', 'file', 5 * min, 2_140),
  node('src/components/Header.tsx', 'file', 3 * day, 3_820),
  node('src/components/SearchBar.tsx', 'file', 2 * min, 1_310),
  node('src/lib', 'dir', 40 * min),
  node('src/lib/api.ts', 'file', 40 * min, 6_904),
  node('src/lib/format.ts', 'file', 9 * day, 812),
  node('src/lib/legacy-client.ts', 'file', 20 * day, 4_400),
  node('src/main.tsx', 'file', 6 * day, 640),
  node('.env.local', 'file', 4 * day, 220),
  node('.gitignore', 'file', 60 * day, 96),
  node('README.md', 'file', 2 * day, 5_210),
  node('package.json', 'file', 1 * day, 1_480),
  node('vite.config.ts', 'file', 15 * day, 410),
]

const p = (path: string) => `${ROOT}/${path}`

const base = {
  root: ROOT,
  nodes,
  expanded: OPEN.map(p),
  cursor: p('src/components/Button.tsx'),
  selected: '',
  query: '',
  showHidden: true,
  showSize: false,
  dirSizes: {},
  git: {
    [p('src/components/Button.tsx')]: 'M',
    [p('src/components/SearchBar.tsx')]: '?',
    [p('src/lib/api.ts')]: 'M',
    [p('src/lib/legacy-client.ts')]: 'D',
    [p('package.json')]: 'M',
  },
  diff: {
    [ROOT]: [58, 131],
    [p('src/components/Button.tsx')]: [12, 3],
    [p('src/lib/api.ts')]: [44, 9],
    [p('src/lib/legacy-client.ts')]: [0, 118],
    [p('package.json')]: [2, 1],
  },
  ignored: [p('node_modules'), p('.env.local')],
  untrackedDirs: [],
  top: ROOT,
  prefix: '',
  branch: { head: 'feat/search', upstream: 'origin/feat/search', host: 'github.com', ahead: 2, behind: 0 },
  counts: {
    [ROOT]: [1, 3, 1],
    [p('src')]: [1, 2, 1],
    [p('src/components')]: [1, 1, 0],
    [p('src/lib')]: [0, 1, 1],
  },
  flash: [],
  flashDim: [],
  flashOn: false,
  flashTones: {},
  scroll: null,
  preview: '',
  previewTop: 0,
}

const activity = (kind: string, label: string, state: 'running' | 'done' | 'failed', tone: string, nerd: string, plain: string, detail = '') => ({
  id: Math.round(Math.random() * 1e9),
  kind,
  label,
  state,
  detail,
  at: now,
  tone,
  nerd,
  plain,
})

/** A repository with changes: git status per file, lines changed, folder counts, the branch ahead of its upstream. */
export const repo = { tree: base, activity: [] }

/** Claude editing one file while it reads another: the write shimmers orange, the read purple, and a selected file. */
export const working = {
  tree: {
    ...base,
    selected: p('src/lib/api.ts'),
    flash: [p('src/components/SearchBar.tsx')],
    flashDim: [p('src/lib/api.ts')],
    flashOn: true,
    flashTones: { [p('src/components/SearchBar.tsx')]: 'orange', [p('src/lib/api.ts')]: 'purple' },
  },
  activity: [],
}

/** A commit just made: the branch row flashes and the footer shows it. */
export const committed = {
  tree: { ...base, flash: ['#branch'], flashOn: true, flashTones: { '#branch': 'green' }, branch: { ...base.branch, ahead: 3 } },
  activity: [activity('git commit', 'committed', 'done', 'green', '\u{f417}', '●', 'a1b2c3d Search bar: debounce input')],
}

/** A push still running. */
export const pushing = {
  tree: base,
  activity: [activity('git push', 'pushing', 'running', 'teal', '\u{f0552}', '↑')],
}

/** A push that failed: the footer says so in red. */
export const pushFailed = {
  tree: base,
  activity: [activity('git push', 'push failed', 'failed', 'teal', '\u{f0552}', '↑')],
}

/** A file picked in the tree, which Claude gets as context: bold in the tree, its path in the footer. */
export const selected = {
  tree: { ...base, selected: p('src/lib/api.ts'), cursor: p('src/lib/api.ts') },
  activity: [],
}

/** Claude reading inside a closed folder: the folder opens, dimly lit, and the file it read is lit. */
export const reading = {
  tree: {
    ...base,
    expanded: [...base.expanded, p('public')],
    nodes: [...nodes.map(n => (n.id === p('public') ? { ...n, loaded: true } : n)), node('public/favicon.svg', 'file', 12 * day, 1_204), node('public/robots.txt', 'file', 30 * day, 24)],
    flash: [p('public/robots.txt')],
    flashDim: [p('public')],
    flashOn: true,
    flashTones: { [p('public/robots.txt')]: 'purple', [p('public')]: 'purple' },
  },
  activity: [],
}

/** The right column as sizes: files in bytes, folders' disk usage. */
export const sizes = {
  tree: { ...base, showSize: true, dirSizes: { [p('.github')]: 8_192, [p('node_modules')]: 312_000_000, [p('public')]: 1_840_000, [p('src')]: 61_440, [p('src/components')]: 12_288, [p('src/lib')]: 16_384 } },
  activity: [],
}

/** Searching: only matching files and the folders above them. */
export const search = { tree: { ...base, query: 'tsx' }, activity: [] }

/** A folder that isn't a git repository. */
export const noRepo = {
  tree: { ...base, git: {}, diff: {}, counts: {}, ignored: [], top: '', branch: null },
  activity: [],
}

/** Very long names, which the rows cut to the pane. */
export const longNames = {
  tree: {
    ...base,
    nodes: [
      ...nodes,
      node('src/components/AnExtremelyLongComponentNameThatKeepsGoingWellPastThePane.tsx', 'file', 1 * min, 9_000),
    ],
    git: { ...base.git, [p('src/components/AnExtremelyLongComponentNameThatKeepsGoingWellPastThePane.tsx')]: 'A' },
    diff: { ...base.diff, [p('src/components/AnExtremelyLongComponentNameThatKeepsGoingWellPastThePane.tsx')]: [212, 0] },
    branch: { head: 'feature/a-very-long-branch-name-for-the-search-rework', upstream: 'origin/feature/a-very-long-branch-name-for-the-search-rework', host: 'github.com', ahead: 12, behind: 4 },
  },
  activity: [],
}

/** A short branch on GitLab, nothing ahead: the name, then the GitLab mark (the upstream its tooltip). */
export const gitlab = { tree: { ...base, branch: { head: 'dev', upstream: 'origin/dev', host: 'gitlab.com', ahead: 0, behind: 0 } }, activity: [] }

/** A branch on Codeberg (Forgejo), one behind. */
export const forgejo = { tree: { ...base, branch: { head: 'main', upstream: 'upstream/main', host: 'codeberg.org', ahead: 0, behind: 1 } }, activity: [] }

/** A branch on a self-hosted remote: the generic remote icon. */
export const otherRemote = { tree: { ...base, branch: { head: 'main', upstream: 'origin/main', host: 'git.example.org', ahead: 0, behind: 0 } }, activity: [] }

/** A local branch that tracks nothing: no upstream icon. */
export const untracked = { tree: { ...base, branch: { head: 'spike', upstream: '', host: '', ahead: 0, behind: 0 } }, activity: [] }
