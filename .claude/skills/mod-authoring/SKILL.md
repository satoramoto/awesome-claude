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
   Any later change to a mod's compiled output (`plugins/<name>/`, a `kit/`
   change included) raises its version in both places, since marketplace
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
  `scale`, `columns` (stacked chart), `pinned`, `perf`, `share`, `capped`, `rounded`,
  and the list pieces `item`, `status`, `tree`, `note`, `action`, `actions`; plus
  `k.ink`, `k.space`, `k.edge`, `k.width` for the surface's colours and grid
  (see "Terminal" below). Read each one's doc comment in `kit/ui.tsx` before using it.
- `@kit/tokens`: `C` (status colours), `INK`, `RAMP`, `TRACK`, `MUTED`, `levelColor(pct)`, `GLYPH`,
  `STATUS` (each status's glyph and colour), `TREE`/`treePrefix`, `THEME_KEY`/`termInk`.
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

## Terminal

The terminal draws the same instrument inspector as the desktop, in cells. Get
it by drawing with the kit on the terminal too: `kit(els, 'terminal', e.props.bodyColumns)`
renders every component below for the terminal. Don't hand-roll rows of
`█`/`░`, `■ label`, `●` statuses or `├─` trees; the kit has each one. Look at
the result in Storybook's `Kit/Terminal*` stories, which draw each primitive at
30, 40, 60 and 100 columns beside the desktop.

### Grid

- Whole cells only. Use `k.space` (`CELLS` on the terminal: pair 1, item 1,
  group 2, block 1) and `k.edge` (left 2, right 0), never `SPACE` numbers, which
  are fractions for the desktop and round unevenly in cells.
- Indent: a section body starts 2 cells in (the fold-arrow gutter), under the
  header's icon column. Each tree level adds 2 (`TREE` connectors are 2 wide).
- Columns of a reading: label 10 | gauge (the rest) | figure 5 | unit 6, one cell
  apart, figures right-aligned so the unit ends on the right edge.
- Widths are exact: the kit knows the pane's columns, so bars, gauges, scales,
  axes and chart columns are drawn to `k.width` (the section body's width,
  columns − 2) by default. A reading or bar that sits deeper or outside a
  section takes `width` explicitly.
- Rows: sections stack with no blank row; an open section leaves one blank row
  under its body. Separate a head line from the sections with one blank row.

### Colour

Each token keeps its one meaning; on the terminal it's drawn as the engine
theme key with that meaning, so it follows the person's terminal theme (dark,
light, colour-blind, ANSI-only). `k.ink(color)` (or `termInk` in `@kit/tokens`)
gives the Text props; the kit's components apply it themselves.

| Token | Means | Terminal |
| --- | --- | --- |
| `C.ok` | done well | `success` |
| `C.bad` | failed, 90%+ | `error` |
| `C.warn` | near a limit, 75%+ | `warning` |
| `C.blue` | live, in progress | `suggestion` |
| `C.purple` | merged | `merged` |
| `MUTED`, `GRAY.*`, `TRACK` | labels, units, quiet marks | `dimColor` (the terminal's own dim) |
| `INK`/slate, `RAMP`, cyan, orchid | quantity, shades within one chart | their hex |

Text: values plain, labels and units dim, bold only titles (and a folder or
current item in a list), uppercase only captions. Never a grey hex on the
terminal: use dim.

### Glyphs

All one cell wide, from blocks monospace fonts carry; none with Unicode's
Emoji property (no ⚠ ⚡ ⚒ ⏱ ↕ ◼ ⬛ ✅): some terminals draw those as emoji, two
cells wide. Check a new one with `bun -e "console.log(/\p{Emoji}/u.test('⌘'))"`
(false is right). Every glyph in `kit/tokens.ts`, `kit/icons.ts` and the kit's
terminal drawing passes; tools is `⌘`, fold `⇕`, and the perf footer's uptime `◷`.

| Use | Glyphs |
| --- | --- |
| Fold | `▾` open, `▸` closed (`FOLD`), dim; the desktop keeps ▼ ▶︎ |
| Gauge (`k.gauge`, a reading's) | `━` fill to the half cell `╸`, on a dim `─` rail |
| Bar (`k.bar`) | `█` fill to the eighth cell `▏▎▍▌▋▊▉`, on a dim `░` track; a part ending mid-cell is drawn over the next part's colour |
| Scale (`k.scale`) | dim `╵` ticks at 0/25/50/75/100%, `▴` marker |
| Columns (`k.columns`) | `▁▂▃▄▅▆▇█`, rows tall, to the eighth of a row |
| Legend key (`k.swatch`) | `■` (the bar it keys); `●` on the desktop |
| Rail (`k.rail`) | `▎` |
| Status (`STATUS`, `k.status`) | running `◐` blue, pending `◌` blue, done `✓` green, failed `✕` red, warn `▲` amber, merged `◆` purple, stopped `■` dim, idle `○` dim |
| Tree (`TREE`, `k.tree`) | `├─` `└─` `│ ` |
| Icons (`k.icon`, `TERM_GLYPH`) | issue `◉`, comment `≡`, PR open `⇡`, merged `◆`, closed `✕`, draft `◌`, file `□`, folder `▸`/`▾`, commit `○`, push/up `↑`, alert `▲`, trash `⌫`, search `⌕`, sync `↻`, home `⌂`, eye `◎`, fold `⇕`, events `↯`, tools `⌘`; a GLYPH is itself; anything else `•` (never the icon's name) |

### Each primitive on the terminal

- `section`: `▾ ◔ Title ……… figures`. Dim arrow (a Button when `onToggle`, key
  `toggle-<id>`), dim icon, bold title; the title keeps up to 12 cells, then it
  and the figures truncate together. No band, rule or box. With `keepRight: true`
  the right side (figures, buttons) keeps its natural width and only the title is
  cut, with an ellipsis: use it when the right side is controls that must all
  show (filetree's header buttons, a launcher row), and size that side to fit the
  row yourself (the launcher drops its least telling parts first). Don't cut a
  title by hand. The desktop draws the same with or without it.
- `summary`: figures plain (or in their status colour), units dim, 2 apart, as
  one line of text: too narrow, it's cut wherever that falls and ends in `…`
  (`4 fa…`), never a figure clipped without one.
- `reading`: as the grid above. Under 6 cells of gauge the label narrows to 6,
  then the gauge is left out and the figures stay.
- `gauge`, `bar`, `scale`, `axis`, `columns`: drawn to the exact width as above.
- `legend`: as many columns as fit at 18 cells (one at 30 columns, two at 40+).
- `prop`: dim label in the reading's label column, value left-aligned after it
  and cut at the edge (the desktop puts the value on the right edge).
- `item` (new): the list row every list uses: `[tree][lead] text  note ……… right`.
  `lead` is a status kind, an icon key or an element; `right` holds dim figures
  and elements (a status, `actions`). Use it for issues, tasks, PRs, files.
  The `note` is always plain dim, whatever `textColor` or `bold` the text has.
  When the row runs out of room the text gives way first, down to its first 6
  cells (with `…`); then the right cluster is cut from its end, the last
  element first (a string with `…`), so nothing runs past the edge.
- `status` (new): a status's glyph and word in its colour.
- `note` (new): `empty` and `loading` lines dim; `error` a red `✕` and the message
  plain. One line, cut at the edge; `k.note(key, text, kind, { lines: 2 })` for a
  long message (why something failed): it breaks between words onto a second
  line, which is cut with `…`. It fits `k.width`; pass `width` when it sits deeper.
  The app surfaces wrap it.
- `action`/`actions` (new): plain Buttons; `quiet` ones dim at rest; `hotkey`
  draws `1: Proceed`. Actions are a cluster on the right edge, 2 apart.
  `autoFocus: true` puts the focus on that action when the site takes the
  keyboard, so Enter presses it: give it to the safe choice (blast-radius's
  Cancel). `tone: 'danger'` draws an action that destroys something with its
  label in the failed colour (`error`; red on the desktop), as blast-radius's
  Proceed.
- `pill`: the label's name in its colour; `tile`: a blank row above, no fill.
- `perf`, `share`: a dim glyph and the figure; slow figures amber or red.

Storybook's `Kit/Terminal Fitting` and `Kit/Terminal States` sheets show each of
these at 30, 40, 60 and 100 columns.

### Do and don't

- Do draw the terminal with the kit's components; a `renderTerminal` that only
  calls `Text` with glyph strings is a sign something's missing from the kit:
  add it there.
- Do pass `bodyColumns` to `kit()`; everything sizes from it.
- Do put `wrap="truncate"` and `minWidth={0}` on every text that can be long:
  a terminal line never wraps.
- Don't draw boxes, borders or backgrounds around content (the one exception is
  a band that must stop the person, like blast-radius's hold: one round border
  in the status colour).
- Don't use hex greys or the desktop's `GRAY` tones on the terminal; use dim.
- Don't mix glyph sets: one failed mark (`✕`, not `✗`), one running mark (`◐`).
- Don't size bars from a guess (`columns - 20`); let the kit fill the width.

## Checks, in order

1. `bun build.ts` (after any change under `mods/` or `kit/`).
2. `claude plugin validate plugins/<name>`, and `claude plugin validate .` for the marketplace.
3. `bunx tsc -p plugins/<name>` (needs the laid types; see `headless-verification`).
4. `claude plugin test plugins/<name>` when the mod has a `*.test.ts`.
5. Look at it in Storybook (`storybook-prototyping`), then in the real app.

All must exit 0. Commit `mods/` and the rebuilt `plugins/` together.
