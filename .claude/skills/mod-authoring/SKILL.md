---
name: mod-authoring
description: How to make a new mod or change an existing one in the awesome-claude repo (mods/overview, mods/issues and any new mods/<name>), built with the shared kit and compiled into plugins/. Use whenever you add, change, restyle or debug a mod, a pane, a render hook, its state contract or its kit components in this repository, even when the request only says "the overview pane" or "the issues pane". Pairs with the engine's plugin-authoring skill, which holds the API itself.
---

# Making a mod in awesome-claude

A mod is a Claude Code plugin made of hooks (a pane, a slash command, a hook on
tool calls). This skill is how mods are made *in this repo*. For the engine's API
(events, `$`, elements, `ui.render`, `$.state`), load the engine's
`plugin-authoring` skill and grep the types it names; don't guess the API.

## Source in mods/, output in plugins/

- Edit `mods/<name>/` and `kit/`. Never edit `plugins/`: `bun build.ts` writes it.
- Why: the engine reads a mod's source as is and refuses any import from outside
  the mod's own folder (symlinks too). `build.ts` copies `kit/` into
  `plugins/<name>/kit/` and rewrites each `@kit/…` import to a relative path.
  Nothing else changes, so `plugins/` stays readable source.
- `plugins/` is committed. CI fails if it wasn't rebuilt, so run `bun build.ts`
  and commit `plugins/` with every change under `mods/` or `kit/`.
- A new mod appears in `plugins/` only after `bun build.ts`.
- Run `bun install` once in a fresh clone or worktree (Storybook, the playground, `bunx tsc`).

## A mod's files

Copy `mods/issues/` as the template (it's the smaller mod):

| File | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | `{ "name", "version", "description", "author", "types": "./types/index.d.ts" }` |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `hooks/register.tsx` | `export const register: Register = on => { ... }`: every hook |
| `hooks/view.tsx` (any name) | the drawing, as pure functions of elements + data, so stories and tests can call them |
| `hooks/<name>.test.ts` | render/behaviour tests for `claude plugin test` (see the `headless-verification` skill) |
| `types/index.d.ts` | the state contract: value types, and `declare module 'claude-code' { interface PluginState { <name>: { ... } } }` |
| `tsconfig.json` | `{ "extends": "./.claude-plugin/types/tsconfig.json" }` (the engine lays that folder; it's gitignored) |

### New mod checklist

1. `cp -R mods/issues mods/<name>`, then rename: `name` in `plugin.json`, the
   `PluginState` key in `types/index.d.ts`, every `atom({ plugin: '<name>', ... })`,
   the pane id and the `/command`. Delete what you don't need, and delete
   `hooks/issues.test.ts` or rewrite it as `hooks/<name>.test.ts` for your mod
   (it tests the issues pane and fails anywhere else).
2. Add an entry for it to `.claude-plugin/marketplace.json` (`name`,
   `source: ./plugins/<name>`, `description`, `version` equal to `plugin.json`'s).
   Bumping a mod's version means bumping it in both places; CI fails on drift
   and on a `plugins/` folder the marketplace doesn't list.
3. Add a fixture `playground/fixtures/<name>.ts` and a story
   `stories/<name>.stories.ts` (see the `storybook-prototyping` skill).
4. Run the checks below, then add the mod to README's mod table.

## State and the types contract

- Every value a drawing reads lives in `$.state`, declared in `types/index.d.ts`
  under the mod's name; `claude plugin validate` holds each `$.state` key the
  module names to that contract.
- Declare atoms once at module top:
  `const list = atom({ plugin: 'issues', key: 'list' } as const, null)`.
  Read with `await read($, list)` inside `ui.render`; write with
  `await update($, list, old => next)` from handlers and timers. A write redraws readers.
- Write only on a real change (compare before `update`, as `refresh` in
  `mods/issues/hooks/register.tsx` does): every write redraws.
- Module variables (timers, caches, `stale` flags) start over on each reload;
  `$.state` survives it.

## Render only while the pane is shown

Both mods do no work while nobody can see the pane. Copy the pattern from
`mods/issues/hooks/register.tsx`:

- `isShown($)`: `(await $.ui.panes()).some(p => p.id === PANE && p.isShown && p.isPlaced)`,
  cached for 2 s.
- One `$.clock.every(5_000, () => void tick($).catch(() => undefined))` started in
  `session.start` (cancel the previous one first: `session.start` fires again on reload).
- `tick` returns at once unless shown; then reads again every `READ_EVERY`, or
  within `AT_MOST` once something set `stale = true`.
- Events (`tool.call` on Bash running `gh issue`, a push) only set `stale`; they
  never fetch themselves. Watching hooks end in `.catch(($, e, next) => next(e))`
  so a failure never blocks the tool call.
- The `/command` that opens the pane resets the cache (`shownAt = 0`) and reads at once.

## Handing work to the session

A button that asks Claude to do something submits a prompt as the person:

```ts
void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.toast('Start: could not send the request to the session'))
```

It runs as a turn once the session is free. Build the text in an exported
function (`refinePrompt`, `startPrompt`, `sprintPrompt` in the issues mod) so it
can be read and tested on its own.

## Drawing with the kit

Import shared code by alias; the build rewrites it:

- `@kit/ui`: `kit(els, surface, columns)` returns the components, `SPACE`, `EDGE`.
  Get `els` from `$.ui.resolve(e)` and pass `e.surface` and `e.props.bodyColumns`.
  Components: `section` (collapsible header row, figures on the right, body
  indented), `summary` (a header's figures with dim units), `reading` (label,
  thin gauge, value, unit), `gauge`, `bar`, `legend`, `swatch`, `prop`, `rail`,
  `tile` (rounded fill for a multi-line list item), `icon`, `caption`, `axis`,
  `scale`, `columns` (stacked chart), `pinned`, `perf`, `share`, `capped`, `rounded`.
  Read each one's doc comment in `kit/ui.tsx` before using it.
- `@kit/tokens`: `C` (status colours), `INK`, `RAMP`, `TRACK`, `MUTED`, `levelColor(pct)`, `GLYPH`.
- `@kit/format`: `tokens`, `duration`, `short`, `ago`, `bytes`, `money`, `pct` (whole percent, as the desktop needs), `basename`.
- `@kit/icons`: `iconSvg`, `ICON_PX`; stroked icons keyed by `GLYPH`, plus GitHub
  Octicons (`issue-opened`, `comment`, `pr-open`, `pr-merged`, `pr-closed`,
  `pr-draft`, the branch glyph). Draw them through `k.icon(key, color)`, which
  falls back to the glyph on the terminal. Add a new Octicon to `FILLED` unchanged.
- Draw the terminal and the app surfaces separately where they differ
  (`renderTerminal` / `renderApp` in `mods/issues/hooks/view.tsx`); `e.surface`
  is `terminal`, `desktop`, `vscode` or `mobile`. `Input` doesn't exist on mobile.

## Design rules

The look is an instrument inspector (think Premiere's Effect Controls):

- One column of sections, each a collapsible header row (▾ title, figures on
  the right) with its properties indented under it. Readings are label, thin flat
  gauge, value, dim unit, in fixed columns.
- No bubbles, panels, outlines, tinted boxes or game words (HP, LV, party).
  The one exception: a multi-line list item sits in a `tile`.
- Bars are rounded only by SVG end caps (`capped`, `gauge`, `bar`); never borders on thin bars.
- Colours come only from `kit/tokens.ts`, each meaning one thing: grey labels and
  icons, slate quantity, blue live/in progress, amber near a limit (75%+), red
  failed (90%+), green done well, purple merged. Colour only where it carries meaning.
- Text: values plain, labels and units dim, bold only titles, uppercase only captions.
- Spacing only from `SPACE` and `EDGE` (`@kit/ui`), never raw numbers.
- Use the kit's components rather than raw boxes and colours.
- Text never wraps on the desktop; let it truncate: `wrap="truncate"` on the
  `Text` and `minWidth={0}` (with `flexShrink={1}`) on every Box between it and
  the row, or the box refuses to shrink below its content and overflows.
- Desktop limits (README, "Drawing for the desktop"): whole percentages only
  (`pct()`), `flexGrow` ≤ 10000, no Box `hover`, no `dashed` borders; SVG blurs
  when scaled, so keep it to small fixed-size pieces.

## Checks, in order

1. `bun build.ts` (after any change under `mods/` or `kit/`).
2. `claude plugin validate plugins/<name>`, and `claude plugin validate .` for the marketplace.
3. `bunx tsc -p plugins/<name>` (needs the laid types; see `headless-verification`).
4. `claude plugin test plugins/<name>` when the mod has a `*.test.ts`.
5. Look at it in Storybook (`storybook-prototyping`), then in the real app.

All must exit 0. Commit `mods/` and the rebuilt `plugins/` together.
