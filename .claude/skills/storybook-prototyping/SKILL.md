---
name: storybook-prototyping
description: Rapid visual prototyping of awesome-claude mods in Storybook, with sample states (fixtures), the surface/theme/frame/width toolbar and screenshots, drawn by zen's Claude Code bench. Use whenever you design, restyle or check how a mod's pane looks, add a scenario or story, or need to see a layout at a narrow width or in the terminal, before or instead of loading the mod in the real app. Kit components themselves are prototyped in zen's Storybook.
---

# Prototyping in Storybook

Storybook draws each mod scenario from the mod's own `ui.render` hook, with a
stand-in engine. It's the fastest loop for how things look. It is an emulator:
the real app is the final truth (see the `headless-verification` skill for that
check).

**The bench and the kit's own stories live in zen** (`github:satoramoto/zen`,
`src/harness/claude-code/bench/` and `stories/`). Here Storybook and the
playground import the bench through the `@bench` alias (`render`, `text`,
`client`, `engine`, `host`) and the kit through `@kit`, both from the pinned
`node_modules/@satoramoto/zen/src/harness/claude-code/`, or from a zen checkout
when `ZEN` is set (`ZEN=~/Code/satoramoto/zen bun run storybook`). The engine's
`claude-code` module is aliased to the bench's `engine.ts`. What the bench
emulates and doesn't, and the kit's component sheets (`Harness/Claude Code/Kit`,
each primitive at 30 to 100 columns, the glyphs, the file types, the skins), are
in zen: see "The bench and Storybook" in
[`docs/harness-claude-code.md`](https://github.com/satoramoto/zen/blob/main/docs/harness-claude-code.md).
A new kit component gets its story there, in zen.

What stays here: this repo's fixtures, its mod stories, the lab and engine
stories, and `playground/mods.ts`, which tells the bench where a `Client`'s
module is found (every file under `mods/<mod>/hooks/`; set with
`configureClients({ resolve: modsResolver })` in `.storybook/preview.ts` and
`playground/main.ts`).

Run `bun install` once per clone or worktree first.

## Add a scenario (fixture)

`playground/fixtures/<mod>.ts` exports named sample states. Each export is one
scenario: an object whose keys are the mod's `PluginState` keys (as declared in
`mods/<mod>/types/index.d.ts`) and whose values are what the atoms would hold.

```ts
// playground/fixtures/issues.ts
export const empty = { list: { repo: 'satoramoto/awesome-claude', more: false, at: now, issues: [] } }
export const reading = { list: null }
```

Cover the states that look different: busy/full, empty, error note, loading
(`null`), extremes (long titles that must truncate, many items, 90%+ levels).
The playground (`bun run playground`) picks fixtures up by file name too.

## Add a story file

Copy `stories/overview.stories.ts` to `stories/<mod>.stories.ts` and change
four things: the fixtures import, the `register` import, the `title`
(`Mods/<Mod>`), the plugin name in `load('<mod>', …)`. Then export one story
per fixture:

```ts
export const Busy = scenario('busy')
export const Empty = scenario('empty')
```

`scenario` loads the fixture into the stand-in state, collects the mod's hooks
(`collect`), draws its panes for the toolbar's surface and width (`panes`),
and redraws on every state change, so buttons that `update` state work.
`Mods/Terminal Look` (`stories/terminal-look.stories.ts`) draws overview,
issues and launcher (and filetree) side by side on each terminal theme; add a
mod there when its terminal look should be compared with the others.

## The toolbar

- **Surface**: `desktop` or `terminal` (the hook gets that `e.surface`).
- **Theme**: `light` or `dark`, and the ANSI themes on the terminal.
- **Frame**: `sidebar` (a copy of the desktop app's side pane beside a transcript) or a plain `pane`.
- **Width**: the pane's width in cells (28 to 180), passed as `bodyColumns`.

Check every new look at a narrow width (28, 36) and a wide one, on both
surfaces, in the sidebar frame, in both themes, and on the terminal in all its
themes.

## Run it and look

- With the preview tools: `preview_start` with name `storybook` (from
  `.claude/launch.json`; it picks a free port), navigate to a story with the
  toolbar set in the URL
  (`/?path=/story/mods-issues--no-repo&globals=surface:terminal;columns:36`),
  wait a moment, take a screenshot and read it. Use the full UI path, not
  `iframe.html`: the bare canvas can draw the frame collapsed. Stop the server
  with `preview_stop` when done.
- From a shell: `bun run storybook` (port 6006, or `PORT=…`); stop it when done.

Story ids are `<title>--<export>` in kebab case: `Mods/Issues` + `NoRepo` is `mods-issues--no-repo`.

## Limits

It's an emulator from captures of the app; spacing, fonts and what the engine
refuses can differ. Before calling a look done, load the mod in the real app.
For what the engine itself accepts, use the `lab` mod: `/lab` lists its
experiments, `/lab <id>` opens one, `/lab gallery` shows them all, and
`mods/lab/verdicts.json` records the engine's verdict on each per surface.
README's "Drawing for the desktop" sums up the limits. The `Engine` section in
Storybook shows those experiments.

A mod that keeps its state in its own module rather than in plugin state
(`blast-radius`) can't be loaded from a fixture: its story drives the mod's real
hooks with a stand-in `$` instead (see `stories/blast-radius.stories.ts`).
