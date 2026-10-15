import { resolve } from 'node:path'

import type { StorybookConfig } from '@storybook/html-vite'

import { zenBench, zenHarness, zenKit } from '../zen'

const ROOT = resolve(__dirname, '..')
/** zen's kit and bench (see zen.ts): the pinned package, or the checkout ZEN names. */
const KIT = zenKit(ROOT)
const BENCH = zenBench(ROOT)

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  // Only the toolbar items the stories use, so the toolbar fits a narrow window
  // without scrolling: no backgrounds, viewports, measure or outline.
  addons: [{ name: '@storybook/addon-essentials', options: { backgrounds: false, viewport: false, measure: false, outline: false } }],
  framework: { name: '@storybook/html-vite', options: {} },
  core: { disableTelemetry: true },
  // The same setup as the playground: the engine stood in for by zen's bench, the
  // kit and bench by their aliases, JSX against the global `h`, and no reading the
  // mods' tsconfig.json.
  viteFinal: async config => {
    config.resolve ??= {}
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      'claude-code': resolve(BENCH, 'engine.ts'),
      '@kit': KIT,
      '@bench': BENCH,
    }
    config.esbuild = { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', tsconfigRaw: '{ "compilerOptions": {} }' }
    // A zen checkout named by ZEN sits outside this repo.
    config.server ??= {}
    config.server.fs ??= {}
    config.server.fs.allow = [...(config.server.fs.allow ?? []), ROOT, zenHarness(ROOT)]
    return config
  },
}

export default config
