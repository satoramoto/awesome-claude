import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { defineConfig } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'

const ROOT = resolve(__dirname, '..')

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
 * After each save under mods/ or kit/: compile the mods into plugins/
 * (`bun build.ts`), then run the engine's own tests on the mod that changed
 * (`claude plugin test plugins/<mod>`), and show the result in the page.
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
      const test = build.code === 0 ? await run(['claude', 'plugin', 'test', `plugins/${mod}`], 60_000) : build
      const summary = test.output.match(/(\d+) pass[\s\S]*?(\d+) fail/)
      server.ws.send({
        type: 'custom',
        event: 'awesome:check',
        data: {
          mod,
          ok: test.code === 0,
          summary: build.code !== 0 ? 'build failed' : summary ? `${summary[1]} pass, ${summary[2]} fail` : `exit ${test.code}`,
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
      server.watcher.add([join(ROOT, 'mods'), join(ROOT, 'kit')])
      server.watcher.on('change', file => {
        const rel = relative(ROOT, file)
        const mod = rel.match(/^mods\/([^/]+)\//)?.[1]
        if (mod) void check(server, mod)
        else if (rel.startsWith('kit/')) for (const m of readdirSync(join(ROOT, 'mods'))) void check(server, m)
      })
    },
  }
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      'claude-code': resolve(__dirname, 'engine.ts'),
      '@kit': resolve(ROOT, 'kit'),
    },
  },
  // A string here stops Vite reading each mod's tsconfig.json, which extends the
  // types the engine lays down only once a mod has loaded.
  esbuild: { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', tsconfigRaw: '{ "compilerOptions": {} }' },
  server: { fs: { allow: [ROOT] } },
  plugins: [checks()],
})
