import type { Meta, StoryObj } from '@storybook/html'

import { collect, elements, engine } from '@bench/host'
import type { Node } from '@bench/render'

import * as mod from '../mods/blast-radius/hooks/register'
import { show, where } from './show'

// Blast Radius (a fork of Anthropic's claude-code-playground mod) keeps the call
// it holds in its own module, not in plugin state, so each story drives the
// mod's real tool.call hook with a risky command and a stand-in `$` whose
// `process.run` answers the measuring commands with canned output. The hook
// holds until Proceed or Cancel is pressed; the pane then shows what the hook
// told Claude, with a button to hold the command again.
const hooks = collect(mod as any)
const hook = (event: string, component?: string) => hooks.find(r => r.event === event && (!component || r.matcher.component === component))!.hook

const meta: Meta = { title: 'Mods/Blast Radius', parameters: { paneTitle: 'Blast Radius' } }
export default meta

type Run = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout: string): Run => ({ exitCode: 0, stdout, stderr: '' })

/** A held command, and what each measuring command answers (the first whose test matches its argv). */
type Scenario = { command: string; answers: [(argv: string[]) => boolean, Run][]; placed?: boolean }

const has = (...words: string[]) => (argv: string[]) => words.every(w => argv.includes(w))
const rmScript = (argv: string[]) => argv[0] === 'bash' && /compgen/.test(argv[2] ?? '')
const cdScript = (argv: string[]) => argv[0] === 'bash' && !rmScript(argv)

const CWD = '/Users/you/Code/acme/web'

const SCENARIOS = {
  rm: {
    command: 'rm -rf build',
    answers: [
      [
        rmScript,
        ok(
          ['1284 48758784 1', 'build/index.html', 'build/assets/index-4f2a.js', 'build/assets/index-4f2a.js.map', 'build/assets/vendor-91cc.js', 'build/assets/vendor-91cc.js.map', 'build/assets/index-77de.css', 'build/assets/logo.svg', 'build/fonts/inter-var.woff2', 'build/robots.txt', 'build/manifest.json'].join('\n'),
        ),
      ],
    ],
  },
  rmNothing: { command: 'rm -rf dist', answers: [[rmScript, ok('0 0 0')]] },
  reset: {
    command: 'git reset --hard',
    answers: [
      [has('status'), ok([' M src/components/Button.tsx', 'M  src/lib/api.ts', ' D src/lib/legacy-client.ts', '?? notes.txt'].join('\n'))],
      [has('--shortstat'), ok(' 3 files changed, 56 insertions(+), 130 deletions(-)')],
    ],
  },
  clean: {
    command: 'git clean -fdx',
    answers: [[has('clean'), ok(['Would remove .env.local', 'Would remove coverage/', 'Would remove node_modules/', 'Would remove notes.txt'].join('\n'))]],
  },
  forcePush: {
    command: 'cd packages/api && git push --force origin main',
    answers: [
      [cdScript, ok(`${CWD}/packages/api`)],
      [has('--verify'), ok('9f8e7d6')],
      [has('log'), ok(['9f8e7d6 Fix the rate limiter under load', '5c4b3a2 Add retry to the webhook sender', '1a2b3c4 Bump dependencies'].join('\n'))],
    ],
  },
  migrate: {
    command: 'python3 manage.py migrate',
    answers: [[has('showmigrations'), ok(['[X] accounts.0001_initial', '[X] accounts.0002_email_unique', '[ ] billing.0007_invoice_due_date', '[ ] billing.0008_backfill_due_dates'].join('\n'))]],
  },
  band: {
    command: 'git checkout -- .',
    placed: false,
    answers: [
      [has('status'), ok([' M src/components/Button.tsx', ' M package.json'].join('\n'))],
      [has('--shortstat'), ok(' 2 files changed, 14 insertions(+), 4 deletions(-)')],
    ],
  },
} satisfies Record<string, Scenario>

/** The hold the story drew last, so a new story ends it (the mod holds one call at a time). */
let current: { signal: { aborted: boolean } } | null = null

const scenario = (name: keyof typeof SCENARIOS): StoryObj => ({
  render: (_, ctx) => {
    const s: Scenario = SCENARIOS[name]
    const placed = s.placed !== false
    const host = document.createElement('div')
    let outcome: string | null = null

    const paint = async () => {
      const { surface, columns } = where(ctx)
      const e = { component: placed ? 'Pane' : 'AbovePrompt', requestId: 'blast-radius', surface, props: { bodyColumns: columns, isFocused: true, placement: 'dock' } }
      const idle = async () => {
        const { Box, Text, Button } = elements
        return Box({
          flexDirection: 'column',
          gap: 1,
          children: [
            Text({ dimColor: true, children: outcome ?? 'Measuring…' }),
            outcome ? Button({ key: 'again', plain: true, label: 'Hold it again', onPress: () => void hold() }) : null,
          ],
        })
      }
      const tree = (await hook('ui.render', e.component)(fake, e, idle)) as Node
      host.replaceChildren(show(tree, ctx, () => void paint()))
    }

    // The engine as the hold sees it: the measuring commands answered from the scenario, sleeps that sleep.
    const fake: any = new Proxy(
      {},
      {
        get: (_, noun) => {
          if (noun === 'session') return { cwd: async () => CWD }
          if (noun === 'process')
            return {
              run: async (argv: string[]) => {
                if (argv[0] === 'sleep') {
                  await new Promise(r => setTimeout(r, Number(argv[1]) * 1000))
                  return ok('')
                }
                return s.answers.find(([test]) => test(argv))?.[1] ?? { exitCode: 1, stdout: '', stderr: `${argv[0]}: not in this story` }
              },
            }
          if (noun === 'ui')
            return {
              resolve: () => elements,
              open: async () => ({ isPlaced: placed }),
              close: async () => undefined,
              invalidate: () => void paint(),
              toast: () => undefined,
            }
          return engine[noun]
        },
      },
    )

    const hold = async () => {
      if (current) current.signal.aborted = true
      const mine = { signal: { aborted: false } }
      current = mine
      outcome = null
      const next = Object.assign(async () => ({ ran: true }), { signal: mine.signal })
      const result = (await hook('tool.call')(fake, { tool: 'Bash', command: s.command }, next)) as { deny?: string; ran?: boolean }
      if (current !== mine) return
      outcome = result?.deny ? `Told Claude: ${result.deny}` : `Ran: ${s.command}`
      void paint()
    }

    void hold()
    void paint()
    return host
  },
})

export const Rm = scenario('rm')
export const RmNothing = scenario('rmNothing')
export const GitReset = scenario('reset')
export const GitClean = scenario('clean')
export const ForcePush = scenario('forcePush')
export const Migrate = scenario('migrate')
export const Band = scenario('band')
/** The desktop pane expanded to about 1400px: the listed paths in columns, the head, summary and buttons across. */
export const RmWide1400: StoryObj = { ...scenario('rm'), globals: { surface: 'desktop', frame: 'pane', columns: '180' } }
