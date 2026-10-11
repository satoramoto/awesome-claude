import { resolve } from 'node:path'

import type { StorybookConfig } from '@storybook/html-vite'

const ROOT = resolve(__dirname, '..')

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  // Only the toolbar items the stories use, so the toolbar fits a narrow window
  // without scrolling: no backgrounds, viewports, measure or outline.
  addons: [{ name: '@storybook/addon-essentials', options: { backgrounds: false, viewport: false, measure: false, outline: false } }],
  framework: { name: '@storybook/html-vite', options: {} },
  core: { disableTelemetry: true },
  // The same setup as the playground: the engine stood in for, the kit by its alias,
  // JSX against the global `h`, and no reading the mods' tsconfig.json.
  viteFinal: async config => {
    config.resolve ??= {}
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      'claude-code': resolve(ROOT, 'playground/engine.ts'),
      '@kit': resolve(ROOT, 'kit'),
    }
    config.esbuild = { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', tsconfigRaw: '{ "compilerOptions": {} }' }
    return config
  },
}

export default config
