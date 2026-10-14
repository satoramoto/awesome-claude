// Compiles each mod in mods/ into a plugin folder in plugins/ that the engine can load:
// the engine reads a mod's source as is and refuses imports from outside the
// plugin's folder, so the kit is copied in beside the mod and `@kit/…` imports
// become relative paths. Nothing else changes; the output stays readable source.
//
// The kit is zen's (src/harness/claude-code/kit, see zen.ts): from the pinned
// @satoramoto/zen in node_modules, or from the zen checkout ZEN names.
//
//   bun build.ts                            compile every mod once
//   bun build.ts --watch                    and again whenever mods/ or the kit change
//   ZEN=~/Code/satoramoto/zen bun build.ts  with the kit from a zen checkout
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { zenKit } from './zen'

const ROOT = import.meta.dir
const MODS = join(ROOT, 'mods')
const KIT = zenKit(ROOT)
const OUT = join(ROOT, 'plugins')
// Laid by the engine beside a mod it loads; never copied.
const SKIP = new Set(['node_modules', 'types-laid'])

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (SKIP.has(name)) return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

/** `from '@kit/ui'` in `file` (inside plugins/<mod>) to a path relative to it. */
export const rewrite = (source: string, file: string, kitDir: string): string =>
  source.replace(/(from\s+|import\s*\(\s*)(['"])@kit\/([^'"]+)\2/g, (_, lead, quote, rest) => {
    let rel = relative(dirname(file), join(kitDir, rest))
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `${lead}${quote}${rel}${quote}`
  })

/** Writes `content` to `path` only when it differs, so a loaded mod reloads only for real changes. */
const put = (path: string, content: string | Buffer) => {
  if (existsSync(path) && readFileSync(path).equals(Buffer.from(content))) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return true
}

/** The engine lays its types under .claude-plugin/types in a loaded mod; the build leaves them be. */
const laid = (rel: string) => rel.startsWith(join('.claude-plugin', 'types'))

export const compile = (mod: string): number => {
  const src = join(MODS, mod)
  const out = join(OUT, mod)
  const wanted = new Set<string>()
  let changed = 0
  const emit = (file: string, target: string) => {
    wanted.add(target)
    const content = /\.(tsx?|jsx?)$/.test(file) ? rewrite(readFileSync(file, 'utf8'), target, join(out, 'kit')) : readFileSync(file)
    if (put(target, content)) changed++
  }
  for (const file of walk(src)) {
    const rel = relative(src, file)
    if (!laid(rel)) emit(file, join(out, rel))
  }
  for (const file of walk(KIT)) if (!/\.test\.tsx?$/.test(file)) emit(file, join(out, 'kit', relative(KIT, file)))
  // Files the sources no longer have.
  if (existsSync(out)) {
    for (const file of walk(out)) {
      if (!wanted.has(file) && !laid(relative(out, file))) {
        rmSync(file)
        changed++
      }
    }
  }
  return changed
}

const mods = () => readdirSync(MODS).filter(m => existsSync(join(MODS, m, '.claude-plugin', 'plugin.json')))

const buildAll = () => {
  const started = performance.now()
  const changed = mods().map(mod => `${mod} (${compile(mod)} changed)`)
  console.log(`built ${changed.join(', ')} in ${Math.round(performance.now() - started)} ms`)
}

if (import.meta.main) {
  buildAll()
  if (process.argv.includes('--watch')) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const again = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          buildAll()
        } catch (err) {
          console.error(err)
        }
      }, 80)
    }
    watch(MODS, { recursive: true }, again)
    watch(KIT, { recursive: true }, again)
    console.log(`watching mods/ and ${KIT}`)
  }
}
