// Sample states for the launcher mod: its PluginState values, by scenario.
const now = Date.now()

const configs = [
  { name: 'app', runtimeExecutable: 'npm', runtimeArgs: ['--prefix', 'app', 'run', 'dev'], port: 5173 },
  { name: 'storybook', runtimeExecutable: 'npm', runtimeArgs: ['--prefix', 'app', 'run', 'storybook'], port: 6006 },
  { name: 'api', runtimeExecutable: 'bun', runtimeArgs: ['run', '--watch', 'server/index.ts'], port: 8787, cwd: 'server' },
  { name: 'docs', runtimeExecutable: 'bun', runtimeArgs: ['run', 'docs:dev'], port: 4321 },
]

const file = { root: '/Users/ryan/Code/satoramoto/yahaha', configs, at: now }

const server = (status: string, port: number, log: string[] = [], code: number | null = null) => ({
  status,
  port,
  log,
  code,
  startedAt: status === 'running' || status === 'starting' ? now - 90_000 : 0,
})

const viteLog = ['$ npm --prefix app run dev', '', '> app@0.0.0 dev', '> vite', '', '  VITE v5.4.10  ready in 312 ms', '', '  ➜  Local:   http://localhost:5173/', '  ➜  Network: use --host to expose']

/** Each state at once: one running from this session, one elsewhere, one failed (unfolded), one starting. */
export const busy = {
  file,
  servers: {
    app: server('running', 5173, viteLog),
    storybook: server('elsewhere', 6006),
    api: server('failed', 8787, ['$ bun run --watch server/index.ts', 'error: Cannot find module "hono" from "server/index.ts"', '', 'exited with code 1'], 1),
    docs: server('starting', 4321, ['$ bun run docs:dev', 'astro  v4.16.0 started in 380ms']),
  },
  open: ['api'],
}

const root = '/Users/ryan/Code/satoramoto/awesome-claude'
const wt = `${root}-desktop-views`
const sharedConfigs = [
  { name: 'playground', runtimeExecutable: 'bun', runtimeArgs: ['run', 'playground'], port: 5173, autoPort: true },
  { name: 'storybook', runtimeExecutable: 'bun', runtimeArgs: ['run', 'storybook'], port: 6006, autoPort: true },
  { name: 'storybook-desktop-views', runtimeExecutable: 'bun', runtimeArgs: ['run', `--cwd=${wt}`, 'storybook'], port: 6006, autoPort: true },
  { name: 'docs', runtimeExecutable: 'bun', runtimeArgs: ['run', 'docs:dev'], port: 4321 },
]
const held = (status: string, port: number, pid: number, command: string) => ({ ...server(status, port), pid, command })

/**
 * Two configurations on one port, only one of them running: the worktree's
 * Storybook holds 6006 (started elsewhere: Take over, Kill, unfolded with its
 * process), so the checkout's reads port taken (Start on the next port, Kill);
 * docs runs elsewhere with its Kill waiting for the confirming press; the
 * playground was taken over (Stop, its output not the launcher's).
 */
export const shared = {
  file: { root, configs: sharedConfigs, at: now },
  servers: {
    playground: { ...held('running', 5173, 41207, `node ${root}/node_modules/.bin/vite --port 5173`), adopted: true },
    storybook: held('taken', 6006, 23329, `node ${wt}/node_modules/.bin/storybook dev --port 6006 --no-open --ci`),
    'storybook-desktop-views': held('elsewhere', 6006, 23329, `node ${wt}/node_modules/.bin/storybook dev --port 6006 --no-open --ci`),
    docs: held('elsewhere', 4321, 51880, `node ${root}/node_modules/.bin/astro dev --port 4321`),
  },
  open: ['storybook-desktop-views', 'playground'],
  adopted: { playground: { pid: 41207, port: 5173, command: `node ${root}/node_modules/.bin/vite --port 5173`, at: now - 60_000 } },
  confirm: { name: 'docs', pid: 51880, until: now + 4_000 },
}

/** Nothing running yet. */
export const stopped = {
  file,
  servers: Object.fromEntries(configs.map(c => [c.name, server('stopped', c.port)])),
  open: [],
}

/** A long name and a long log line that must truncate, unfolded. */
export const long = {
  file: {
    ...file,
    configs: [{ name: 'storybook-with-a-very-long-configuration-name-that-truncates', runtimeExecutable: 'npm', runtimeArgs: ['run', 'storybook', '--', '--no-open', '--ci', '--quiet'], port: 6006 }],
  },
  servers: {
    'storybook-with-a-very-long-configuration-name-that-truncates': server('running', 6006, [
      '$ npm run storybook -- --no-open --ci --quiet',
      'info => Serving static files from ././public at /, with a very long line that the pane must cut rather than wrap or overflow',
    ]),
  },
  open: ['storybook-with-a-very-long-configuration-name-that-truncates'],
}

/** The project has no .claude/launch.json. */
export const noFile = {
  file: { root: '/Users/ryan/Code/satoramoto/elsewhere', configs: [], at: now, note: 'No .claude/launch.json in this project.' },
  servers: {},
  open: [],
}

/** Before the first read. */
export const reading = { file: null, servers: {}, open: [] }
