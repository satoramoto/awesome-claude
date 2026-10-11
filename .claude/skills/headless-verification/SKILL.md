---
name: headless-verification
description: How to check an awesome-claude mod works without opening the app (build, claude plugin validate, tsc, claude plugin test with render tests on each surface, a headless claude -p smoke run), then for real in the desktop app. Use whenever you finish or debug a change under mods/ or kit/, write or fix a mod's *.test.ts, need the engine's types for tsc, or need to know why the engine refused a hook or a tree.
---

# Verifying a mod headlessly

Run these in order from the repo root; each must exit 0. Cap output
(`2>&1 | tail -n 30`) and judge by the exit code, not by grepping.

## 1. Build

```bash
bun build.ts
```

Compiles every `mods/<mod>/` into `plugins/<mod>/` (kit copied in, `@kit/…`
rewritten). Run it after any change under `mods/` or `kit/`; everything below
reads `plugins/`, never `mods/`. Commit the rebuilt `plugins/`: CI fails otherwise.

## 2. Validate

```bash
claude plugin validate plugins/<mod>
claude plugin validate .            # the marketplace: every plugins/ folder listed, versions matching
```

It reads the manifest and the hooks module as the engine will and lists:

- the state the contract declares (`declares state: issues.list, …`);
- `hooks:` each `on(...)` with its matcher (`ui.render{component=Pane, requestId=issues}`);
- `calls:` each `$.noun.method` the module reaches, and through which function;
- `state writes:` / `state reads:`, checked against `types/index.d.ts`;
- anything the engine would refuse, as an error, and the exit code fails.

A key read or written that the contract doesn't declare, or a call that
doesn't exist, shows up here before the app ever loads the mod.

## 3. Type-check

```bash
bunx tsc -p plugins/<mod>
```

`plugins/<mod>/tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`,
which the engine lays (with the API's `.d.ts`) the first time it loads the mod.
That folder is gitignored, so a fresh clone, a new worktree or a new mod has
none. Lay it either way:

- Load the mods once headlessly: `CLAUDE_CODE_PLUGIN_DIRS=$PWD/plugins claude -p "/<mod>"`
  (step 5). The engine writes `.claude-plugin/types/` into every mod it loaded.
- Or copy them from a mod that has them, in this or another checkout:
  `cp -R plugins/overview/.claude-plugin/types plugins/<mod>/.claude-plugin/types`.

`bun build.ts` leaves laid types alone. They cover `hooks/`, `types/` and
`tests/`, so a `hooks/*.test.ts` is type-checked too.

## 4. Test

```bash
claude plugin test plugins/<mod>
```

Runs the mod's `*.test.ts` against the engine itself, in the sandbox hooks run
in (no fs, network or process). Tests are render and behaviour tests: mount the
mod's component on a surface, act on it by key, check what it draws. Don't
write tests that restate a function's code.

How a test is built (the full example is `mods/issues/hooks/issues.test.ts`):

- `import { expect, mock, test } from 'claude-code/testing'`;
  `test(name, async ($, on) => { ... })`. `$` is the engine; hooks you add with
  `on` sit *beneath* the mod and stand for the engine.
- Nothing beneath the mod answers by default. Answer what the mod calls:
  an op on `$` returns `{ value }` (`on('process.run', async () => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))`,
  `on('ui.open', async () => ({ value: { isPlaced: true } }))`,
  `on('session.cwd', async () => ({ value: '/repo' }))`); an event returns its
  result (`on('command.run', async () => ({ text: '' }))`). The failure message
  names what's missing: `nothing beneath the plugins answers command.run`.
- `mock.clock(on, { now })` holds time still so `$.clock.every` timers don't fire.
- The test's `$` has no `$.state`: seed state by driving the mod (run its
  command with gh answered), not by writing atoms.
- Mount on each surface, never an assumed one:

```ts
const PANE = {
  component: 'Pane',
  requestId: 'issues',
  props: { title: 'Issues', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('/issues opens a pane listing the open issues', async ($, on) => {
  engine(on) // the on(...) answers above
  await $.command.run({ command: 'issues', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'issues', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Fold arrow is clipped' })).toBeDefined()
    await ui.unmount()
  }
})
```

- Act and read by key: `ui.find({ key })`, `ui.findAll({ type: 'Button', text })`,
  `ui.press({ key })`, `ui.input({ key, text })`, `ui.drawn()` for the whole tree.
  Each act resolves after its handler's work settles; assert right after it.
- The module, and its own variables, outlive a test; state doesn't. Keep a
  scenario that depends on module variables (a `busy` flag, a cache) in one test.
- A mount rejects with the reason when the surface refuses the tree (an element
  it lacks, a prop not allowed): that's the desktop validator, caught headlessly.

The full testing API is in the engine's types: grep `declare module 'claude-code/testing'`
in `plugins/<mod>/.claude-plugin/types/claude-code/index.d.ts`.

## 5. Headless smoke run

```bash
CLAUDE_CODE_PLUGIN_DIRS=$PWD/plugins claude -p "/issues"
```

Loads every compiled mod into a real headless session and runs the command; a
mod-answered command prints its text (`issues: Issues pane opened.`) without a
model turn. A hook that failed or a module that didn't load is in the debug log
(`claude --debug -p …`), as `<plugin>: <line>`.

## 6. The real app

Last, look at it where it's used:

- Load the compiled mods: `CLAUDE_CODE_PLUGIN_DIRS=$PWD/plugins claude` (a
  folder of plugins loads each one), or one at a time with
  `claude --plugin-dir plugins/<mod>`, or for every session set
  `CLAUDE_CODE_PLUGIN_DIRS=<repo>/plugins` and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`
  in `~/.claude/settings.json` `env`, as README shows. Then `/overview` or `/issues`.
- After a rebuild, run `/reload-plugins` (with `bun run watch` and the watch
  setting, a save reloads the mod by itself).
- Read the transcript: while a session reloads a plugin folder, a dim line
  reports each refusal, such as
  `issues: ui.render (Pane) refused: <reason>; the engine drew its own`.
  Fix every one; they mean the app drew something other than your tree.
- Check both the desktop app and the terminal, narrow and wide.
