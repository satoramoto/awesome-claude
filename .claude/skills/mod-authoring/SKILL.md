---
name: mod-authoring
description: How to make a new mod or change an existing one in the awesome-claude repo (mods/overview, mods/issues and any new mods/<name>), built with zen's Claude Code kit and compiled into plugins/. Use whenever you add, change, restyle or debug a mod, a pane, a render hook, its state contract or the kit components it draws with in this repository, even when the request only says "the overview pane" or "the issues pane". Pairs with the engine's plugin-authoring skill, which holds the API itself.
---

# Making a mod in awesome-claude

A mod is a Claude Code plugin made of hooks (a pane, a slash command, a hook on
tool calls). This skill is how mods are made *in this repo*. For the engine's API
(events, `$`, elements, `ui.render`, `$.state`), load the engine's
`plugin-authoring` skill and grep the types it names; don't guess the API.

**The kit, its design rules, the engine's limits and the bench live in zen**
(`github:satoramoto/zen`, `src/harness/claude-code/`), pinned here as the
`@satoramoto/zen` dev dependency. The reference is zen's
[`docs/harness-claude-code.md`](https://github.com/satoramoto/zen/blob/main/docs/harness-claude-code.md)
(the package doesn't ship `docs/`; read it on GitHub or in a zen checkout at
`~/Code/satoramoto/zen`):

| For | Read in zen's doc |
| --- | --- |
| the look: sections, readings, colours, text, spacing, truncation, flow columns | "The inspector: design rules" |
| every component, `holdButtons`, the grid constants, tokens, icons, format, perf | "The kit" (and each component's doc comment in `kit/ui.tsx`) |
| statuses, glyphs, the Emoji-property check | "Statuses and glyphs" |
| the terminal's grid, the "rules" look, text roles, states, lists, hints | "The terminal: grid, look and states" |
| what the engine and the desktop accept (units, borders, Buttons, SVG) | "What the engine and the desktop accept" |
| skins: the terminal's theme keys, wearing another pack (`wear`) | "Skins: how a pack maps to each surface" |
| the bench and its Storybook (`Harness/Claude Code/Kit` sheets) | "The bench and Storybook" |

The kit's source to read: `node_modules/@satoramoto/zen/src/harness/claude-code/kit/`
(`ui.tsx`, `tokens.ts`, `icons.ts`, `format.ts`, `perf.ts`, `skin.ts`, `skins.ts`).
What follows is what's specific to this repo.

## Source in mods/, output in plugins/

- Edit `mods/<name>/` only. Never edit `plugins/`: `bun build.ts` writes it.
- Why: the engine reads a mod's source as is and refuses any import from outside
  the mod's own folder (symlinks too). `build.ts` copies zen's kit into
  `plugins/<name>/kit/` and rewrites each `@kit/…` import to a relative path.
  Nothing else changes, so `plugins/` stays readable source.
- `plugins/` is committed. CI fails if it wasn't rebuilt, so run `bun build.ts`
  and commit `plugins/` with every change under `mods/` (or to the zen pin).
- A new mod appears in `plugins/` only after `bun build.ts`.
- Run `bun install` once in a fresh clone or worktree (zen's kit, Storybook, the
  playground, `bunx tsc`).

## Changing the kit

The kit is zen's: change it in zen (`src/harness/claude-code/kit/`, with zen's
own checks, listed under "Checks" in its doc), merge it there, then raise the pin
here: the commit in `"@satoramoto/zen": "github:satoramoto/zen#<sha>"` in
`package.json`, `bun install`, `bun build.ts`, and bump every mod whose
`plugins/<mod>/` changed.

While working on both at once, point the build and the bench at a zen checkout
instead of the pin: `ZEN=~/Code/satoramoto/zen bun build.ts` (or `bun run
watch`, `bun run playground`, `bun run storybook` with `ZEN` set). `--watch`
and the playground watch that kit folder too. Never commit `plugins/` built from
an unpinned checkout: rebuild from the pin first.

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
   Any later change to a mod's compiled output (`plugins/<name>/`, a new zen
   pin included) raises its version in both places, since marketplace
   installs only update when it changes. CI fails on drift between the two, on
   a `plugins/` folder the marketplace doesn't list, and on a PR that changes a
   mod's output without raising its version above the base's.
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
- Read the kit's tokens (`C.blue`, `INK`, `STATUS.done.color`) when drawing,
  never into a module-level constant: a skin worn later recolours them in place.

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

Import the kit by alias (`@kit/ui`, `@kit/tokens`, `@kit/format`, `@kit/icons`,
`@kit/perf`); the build rewrites it. The components and their rules are in zen's
doc ("The kit", "The inspector: design rules"). In this repo:

- In a render: awaits first, then `const els = holdButtons($.ui.resolve(e), e)`
  and `const k = kit(els, e.surface, e.props.bodyColumns, { focused: e.props.isFocused })`.
- Draw the terminal and the app surfaces separately where they differ
  (`renderTerminal` / `renderApp` in `mods/issues/hooks/view.tsx`).
- An icon button on the desktop (filetree's `iconButton`) is the icon with a
  Button of two `BLANK`s over it; its `alt` carries the name.
- The one border in the mods is blast-radius's warning hold, a band that must
  stop the person.
- `filetree` stays one column; the others flow their sections through `k.flow`
  and keep the `columns` switch in their state contract.
- The terminal's look was picked from alternatives (`inspector`; `panel`;
  `ledger`) in commit ab3a37a, with the story that compared them.

A `renderTerminal` that only calls `Text` with glyph strings means something is
missing from the kit: add it in zen.

### The kit's tests

`mods/overview/hooks/kit.test.ts` holds the kit's own tests through the engine
(the build leaves kit test files out, so they live in overview): the glyph
tables free of the Emoji property and variation selectors, and every primitive
drawn on the terminal with no raw hex (besides a pill's swatch). A new glyph
goes in one of the tables it walks. zen tests the skins and tokens itself.

### Checking it in a real terminal

Storybook's terminal is an emulator with a browser font: it hides how shade
glyphs, italics and spacing come out in a real one. Before calling a terminal
look done, run it in a real pty:

- `tmux -L <name> new-session -d -s <s> -x 120 -y 70 "claude --settings '{\"env\":{\"CLAUDE_CODE_PLUGIN_DIRS\":\"<worktree>/plugins\"}}'"`
  (the `--settings` env replaces a user-level `CLAUDE_CODE_PLUGIN_DIRS`, so only
  your build loads), then send `/overview` with `send-keys`.
- The pane docks beside the transcript from 110 columns. Set its width by
  dragging the divider with SGR mouse escapes: `send-keys Escape "[<0;80;10M"
  Escape "[<32;60;10M" Escape "[<0;60;10m"` moves it from column 80 to 60.
  Clicks the same way pick a pane tab or focus the composer.
- `/theme` previews each theme live while its picker is open (Esc restores
  yours): capture light that way rather than changing the setting.
- After `bun build.ts`, `/reload-plugins` then `/overview` again redraws with
  the new code.
- `tmux capture-pane -e -p` gives the ANSI; render it to PNG with a real
  monospace font (ansi2html via `uvx`, then headless Chrome, Menlo 14px on
  16px lines so block glyphs touch) and look at it. Kill the tmux server and
  check `ps` when done.

## The lab

`mods/lab` holds the experiments that probe what the engine accepts (`/lab`,
`/lab <id>`, `/lab gallery`), and `mods/lab/verdicts.json` the engine's verdict
on each per surface. Re-check there when the engine changes, and update zen's
"What the engine and the desktop accept" from what it finds.

## Checks

After a change, run only these:
1. `bun build.ts` (after any change under `mods/` or to the zen pin).
2. `bunx tsc -p plugins/<name>` (needs the laid types; see `headless-verification`).

Both must exit 0. Commit `mods/` and the rebuilt `plugins/` together.

`claude plugin validate`, `claude plugin test` and tests themselves belong to a
separate test pass, written to a spec (see AGENTS.md). CI runs everything on the PR.
