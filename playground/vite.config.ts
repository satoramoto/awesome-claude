import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { defineConfig } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'

import { zenBench, zenHarness, zenKit } from '../zen'

const ROOT = resolve(__dirname, '..')
/** zen's kit and bench (see zen.ts): the pinned package, or the checkout ZEN names. */
const KIT = zenKit(ROOT)
const BENCH = zenBench(ROOT)

/** Runs a command, capped at `ms`; resolves its exit code and output. */
const run = (cmd: string[], ms: number) =>
  new Promise<{ code: number; output: string }>(done => {
    const child = spawn(cmd[0]!, cmd.slice(1), { cwd: ROOT })
    let output = ''
    child.stdout.on('data', d => (output += d))
    child.stderr.on('data', d => (output += d))
    const timer = setTimeout(() => child.kill('SIGTERM'), ms)
    child.on('close', code => {
      clearTimeout(timer)
      done({ code: code ?? 1, output })
    })
  })

/**
 * After each save under mods/ or the kit: compile the mods into plugins/
 * (`bun build.ts`), then have the engine validate the mod that changed
 * (`claude plugin validate plugins/<mod>`), and show the result in the page.
 */
const checks = (): Plugin => {
  let busy = false
  let again: string | null = null
  const check = async (server: ViteDevServer, mod: string) => {
    if (busy) {
      again = mod
      return
    }
    busy = true
    try {
      const build = await run(['bun', 'build.ts'], 30_000)
      const test = build.code === 0 ? await run(['claude', 'plugin', 'validate', `plugins/${mod}`], 60_000) : build
      server.ws.send({
        type: 'custom',
        event: 'awesome:check',
        data: {
          mod,
          ok: test.code === 0,
          summary: build.code !== 0 ? 'build failed' : test.code === 0 ? 'valid' : 'invalid',
          output: test.output.slice(-4000),
        },
      })
    } finally {
      busy = false
      if (again) {
        const next = again
        again = null
        void check(server, next)
      }
    }
  }
  return {
    name: 'awesome-checks',
    configureServer(server) {
      server.watcher.add([join(ROOT, 'mods'), KIT])
      server.watcher.on('change', file => {
        const rel = relative(ROOT, file)
        const mod = rel.match(/^mods\/([^/]+)\//)?.[1]
        if (mod) void check(server, mod)
        else if (!relative(KIT, file).startsWith('..')) for (const m of readdirSync(join(ROOT, 'mods'))) void check(server, m)
      })
    },
  }
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      'claude-code': join(BENCH, 'engine.ts'),
      '@kit': KIT,
      '@bench': BENCH,
    },
  },
  // A string here stops Vite reading each mod's tsconfig.json, which extends the
  // types the engine lays down only once a mod has loaded.
  esbuild: { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', tsconfigRaw: '{ "compilerOptions": {} }' },
  server: { fs: { allow: [ROOT, zenHarness(ROOT)] } },
  plugins: [checks()],
})
