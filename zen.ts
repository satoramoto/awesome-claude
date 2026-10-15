// Where zen's Claude Code harness is: the kit the mods draw with and the bench
// that draws them in the browser (github:satoramoto/zen, src/harness/claude-code).
// From the pinned package in node_modules, or, with ZEN set to a zen checkout
// (`ZEN=~/Code/satoramoto/zen bun build.ts`), from that checkout, for live work
// on the kit. Used by build.ts, the playground and Storybook.
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/** The harness folder, for the repo at `root`. */
export const zenHarness = (root: string): string => {
  const zen = process.env.ZEN
    ? resolve(process.env.ZEN.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'))
    : dirname(createRequire(join(root, 'package.json')).resolve('@satoramoto/zen/package.json'))
  return join(zen, 'src', 'harness', 'claude-code')
}

/** The kit (`@kit/…`): ui.tsx, tokens.ts, icons.ts, format.ts, perf.ts, skin.ts, skins.ts. */
export const zenKit = (root: string): string => join(zenHarness(root), 'kit')

/** The bench (`@bench/…`): render.ts, text.ts, client.ts, engine.ts, host.ts. */
export const zenBench = (root: string): string => join(zenHarness(root), 'bench')
