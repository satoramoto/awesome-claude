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
