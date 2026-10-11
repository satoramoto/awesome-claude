---
name: storybook-prototyping
description: Rapid visual prototyping of awesome-claude mods and kit components in Storybook, with sample states (fixtures), the surface/theme/frame/width toolbar and screenshots. Use whenever you design, restyle or check how a mod's pane or a kit component looks, add a scenario or story, or need to see a layout at a narrow width or in the terminal, before or instead of loading the mod in the real app.
---

# Prototyping in Storybook

Storybook draws each kit component and each mod scenario from the mod's own
`ui.render` hook, with a stand-in engine (`playground/engine.ts`). It's the
fastest loop for how things look. It is an emulator: the real app is the final
truth (see the `headless-verification` skill for that check).

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
Kit components have their own stories in `stories/kit.stories.ts` with
controls; add one there when you add a component to `kit/ui.tsx`.

## The toolbar

- **Surface**: `desktop` or `terminal` (the hook gets that `e.surface`).
- **Theme**: `light` or `dark` (desktop only).
- **Frame**: `sidebar` (a copy of the desktop app's side pane beside a transcript) or a plain `pane`.
- **Width**: the pane's width in cells (28 to 110), passed as `bodyColumns`.

Check every new look at a narrow width (28, 36) and a wide one, on both
surfaces, in the sidebar frame, in both themes.

## What the bench emulates

It lays out like the desktop app, so problems show here first:

- Text never wraps. Long text needs `wrap="truncate"`.
- A box doesn't shrink below its content unless it has `minWidth={0}`: a row
  that overflows the frame means a Box between the text and the row is missing it.
- Columns fit the canvas: if the chosen width doesn't fit the window, the pane
  narrows and the story is told the columns that fit, as in the app.

It doesn't emulate the engine's validator (a prop the desktop refuses still
draws here), real data, timers or `gh`. Run the build and validate too.

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
README's "Drawing for the desktop" sums up the limits. An `Engine` section in
Storybook with those experiments is coming (branch `bench-engine`).
