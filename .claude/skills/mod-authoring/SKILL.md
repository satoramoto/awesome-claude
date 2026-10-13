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

- `@kit/ui`: `kit(els, surface, columns, { focused })` returns the components;
  also `SPACE`, `EDGE`, `MIN_COLUMNS`, the terminal glyph tables (`METER`,
  `FOLD`, `MARK`, `SPARK`, `PERF_GLYPH`) and the types `KitOptions`,
  `RightPart`, `Hint`. Get `els` from `$.ui.resolve(e)` and pass `e.surface`,
  `e.props.bodyColumns` and `{ focused: e.props.isFocused }` (the pane has the
  keyboard; left out, it counts as focused; read back as `k.focused`).
  Components: `section` (collapsible header row, figures on the right, body
  indented), `summary` (a header's figures with dim units, and its loading or
  stale state), `reading` (label, thin gauge, value, unit), `gauge`, `bar`,
  `legend`, `swatch`, `prop`, `rail`, `tile` (rounded fill for a multi-line list
  item), `icon`, `caption`, `axis`, `scale`, `columns` (stacked chart, counts per
  bucket), `spark` (a sparkline, a series over time), `pinned`, `perf`, `share`,
  `capped`, `rounded`, the list pieces `item`, `status`, `tree`, `note`,
  `action`, `actions`, and `hints` (the terminal's key-hint line); plus `k.ink`,
  `k.space`, `k.edge`, `k.width` for the surface's colours and grid (see
  "Terminal" below). Read each one's doc comment in `kit/ui.tsx` before using it.
- `@kit/tokens`: `C` (status colours), `INK`, `RAMP`, `TRACK`, `MUTED`, `levelColor(pct)`, `GLYPH`,
  `STATUS` (each status's glyph and colour), `TREE`/`treePrefix`, `THEME_KEY`,
  `TERM_TINT`, `termInk` (and its `TermInk` props), `isKitColor`.
- `@kit/format`: `tokens`, `duration`, `short`, `ago`, `bytes`, `money`, `pct`
  (whole percent, as the desktop needs), `middle` (cut in the middle, a path
  keeping its end: `src/…/view.tsx`), `basename`.
- `@kit/icons`: `iconSvg`, `ICON_PX`; stroked icons keyed by `GLYPH`, plus GitHub
  Octicons (`issue-opened`, `comment`, `pr-open`, `pr-merged`, `pr-closed`,
  `pr-draft`, the branch glyph). Draw them through `k.icon(key, color)`, which
  falls back to the glyph on the terminal. Add a new Octicon to `FILLED` unchanged.
- An icon button on the desktop (filetree's `iconButton`) is the icon with a
  Button over it whose label is two Braille blanks (U+2800), which draw nothing
  and no renderer trims. Known limitation: screen readers hear those buttons as
  unnamed, because the engine gives a Button no accessible name separate from its
  label. The icon's `alt` carries the name until the engine adds one.
- Draw the terminal and the app surfaces separately where they differ
  (`renderTerminal` / `renderApp` in `mods/issues/hooks/view.tsx`); `e.surface`
  is `terminal`, `desktop`, `vscode` or `mobile`. `Input` doesn't exist on mobile.

## Design rules

The look is an instrument inspector (think Premiere's Effect Controls):

- A wide desktop pane flows its sections into columns: draw them through
  `k.flow('sections', [...])` (or `flow(Box, e.surface, columns, key, blocks)`
  in a hook without the kit). From 82 reported columns two, from 124 three
  (`FLOW_MIN` 40, `FLOW_MAX` 3), each section whole, read down then across,
  balanced by estimated rows; narrower, and always on the terminal, the blocks
  come back unchanged. Size anything you cut by hand to `k.flowColumns(n).width`,
  not the pane's columns. Blocks that space themselves apart in one stack (a
  list's tiles) drop their margin when flowing and pass `{ gap }` instead.
- One column of sections (per flow column), each a collapsible header row (icon, title, figures,
  then the fold arrow ▾ last, flush right) with its properties indented under it. Readings are label, thin flat
  gauge, value, dim unit, in fixed columns.
- No bubbles, panels, outlines, tinted boxes or game words (HP, LV, party).
  The one exception: a multi-line list item sits in a `tile`.
- Bars are rounded only by SVG end caps (`capped`, `gauge`, `bar`); never borders on thin bars.
- Colours come only from `kit/tokens.ts`, each meaning one thing: grey labels and
  icons, slate quantity, blue live/in progress, amber near a limit (75%+), red
  failed (90%+), green done well, purple merged. Colour only where it carries meaning.
  On the terminal no fixed hex is drawn at all (see "Colour" under Terminal).
- Text: values plain, labels and units dim, bold only titles, uppercase only captions
  (the desktop; the terminal draws its own text roles, under Terminal).
- Spacing only from `SPACE` and `EDGE` (`@kit/ui`), never raw numbers.
- Use the kit's components rather than raw boxes and colours.
- Text never wraps on the desktop; let it truncate: `wrap="truncate"` on the
  `Text` and `minWidth={0}` (with `flexShrink={1}`) on every Box between it and
  the row, or the box refuses to shrink below its content and overflows.
- Desktop limits (README, "Drawing for the desktop"): whole percentages only
  (`pct()`), `flexGrow` ≤ 10000, no Box `hover`, no `dashed` borders; SVG blurs
  when scaled, so keep it to small fixed-size pieces.

### Desktop spacing and borders, as the real app draws them

Measured against the real desktop pane (2.1.295); the Storybook bench applies
the same rules (`unit()` and `borderOf()` in `playground/render.ts`), so what it
shows is what the app draws. Design within them:

- **Any number is accepted** for margin, padding, gap, width and height, fractions
  included (the validator refuses only non-numbers, and percentages that aren't
  whole). There's no spacing scale to snap to, so the kit's `SPACE`/`EDGE` *are*
  the scale: use them, never raw numbers.
- **Horizontal units are columns, ~7.8px**: width, minWidth, paddingX/Left/Right,
  marginX/Left/Right, columnGap, and `gap` between items in a row.
- **Size units are rows, ~19px (one text line)**: height, minHeight, top, bottom.
  A `height={3.5}` chart is 66.5px.
- **Vertical spacing is half a row, ~9.5px a unit**: marginTop/Bottom/Y,
  paddingTop/Bottom/Y, rowGap (and `gap` between rows). So `marginTop={1}` is
  half a text line, not a line: a section's body sits 9.5px under its header and
  sections 19px apart (body marginBottom 1 + section marginTop 1).
- **Row heights follow their content**: a native Button, a Link or an icon is
  not exactly a text line tall, so a padded row grows or shrinks with what it
  holds. Bands (section headers, the perf footer) therefore take a fixed
  `height: BAND_ROWS` (1.3 rows) instead of vertical padding, so every header is
  the same height.
- **Borders**: `round`, `single`, `double`, `bold`, `classic` draw; `dashed`
  doesn't. A colour the desktop doesn't know, `transparent` included, draws in
  the text's colour, so a "transparent" border is a visible outline. There's no
  way to round a fill without an outline: bands and tiles are square-cornered
  fills (`FILL`), and the only border in the mods is blast-radius's warning hold.
- **Backgrounds**: hex and `rgba()` fills draw (the kit's `FILL` and `TRACK`).
- **Buttons draw their `label` alone**, uncoloured (`dimColor` dims it), never
  their children or the children's styling. A coloured action (`tone: 'danger'`)
  is a coloured Text with a Button of `BLANK`s (U+2800) laid over it; an icon
  button is the icon with such a Button over it.

## Terminal

The terminal draws the same instrument inspector as the desktop, in cells. Get
it by drawing with the kit on the terminal too: `kit(els, 'terminal', e.props.bodyColumns)`
renders every component below for the terminal. Don't hand-roll rows of
`█`/`░`, `■ label`, `●` statuses or `├─` trees; the kit has each one. Look at
the result in Storybook's `Kit/Terminal*` stories, which draw each primitive at
30, 40, 60 and 100 columns beside the desktop. The toolbar's Theme (light, dark,
light-ansi, dark-ansi) sets the terminal's theme too: check every terminal
change on all four.

### Grid

- Whole cells only. Use `k.space` (`CELLS` on the terminal: pair 1, item 1,
  group 2, block 1) and `k.edge` (left 2, right 1), never `SPACE` numbers, which
  are fractions for the desktop and round unevenly in cells. Figures stop one
  cell short of the pane's edge.
- Measure: a dashboard of readings passes `measure: MEASURE` (72) to `kit()`:
  wider than that, its sections keep 72 cells and the rest of the pane stays
  empty, so readings, legends and figures don't spread across a wide pane. A
  list that wants every cell (a file tree) leaves it out.
- Indent: a section body starts 2 cells in (the fold-arrow gutter), under the
  header's icon column. Each tree level adds 2 (`TREE` connectors are 2 wide).
- Columns of a reading: label 10 | gauge (the rest) | figure 5 | unit 6, one cell
  apart, figures right-aligned so the unit ends on the right edge.
- Widths are exact: the kit knows the pane's columns, so bars, gauges, scales,
  axes and chart columns are drawn to `k.width` (the section body's width:
  the measure or the pane, less the gutter 2 and the right margin 1) by
  default. A reading or bar that sits deeper or outside a section takes `width`
  explicitly.
- Rows, one rhythm: every section leaves one blank row under it, open or folded
  (none under the narrow floor). Inside a body, no blank rows except one
  between blocks (`k.space.block`): a chart taller than a row and its legend,
  the checkout and its PR list, one multi-line list item and the next. A
  one-row bar's legend sits right under it. Separate a head line from the
  sections with one blank row.
- The narrow floor: below `MIN_COLUMNS` (30) pane columns each section draws its
  header and figures only, no body, rather than every reading collapsing to an
  ellipsis. Make sure a section's figures say what matters on their own.

### Colour

Each token keeps its one meaning; on the terminal it's drawn as the engine
theme key with that meaning, the terminal's dim, or the default foreground, so
it follows the person's terminal theme (dark, light, colour-blind, ANSI-only).
No fixed hex reaches the terminal: one can vanish on a light, an ANSI-only or a
colour-blind theme. `k.ink(color)` (or `termInk` in `@kit/tokens`) gives the
Text props; the kit's components apply it themselves.

| Token | Means | Terminal |
| --- | --- | --- |
| `C.ok` | done well | `success` |
| `C.bad` | failed, 90%+ | `error` |
| `C.warn` | near a limit, 75%+ | `warning` |
| `C.blue` | live, in progress | `suggestion` |
| `C.purple` | merged | `merged` |
| `MUTED`, `GRAY.*`, `TRACK` | labels, units, quiet marks | `dimColor` (the terminal's own dim) |
| `INK`/slate | quantity | the default foreground |
| `RAMP.slate` | shades of quantity within one chart | default foreground and dim in turn (`TERM_TINT`) |
| `RAMP.blue` | shades of live within one chart | `suggestion` and dimmed `suggestion` in turn (`TERM_TINT`) |
| cyan, orchid | other parts within one chart | cyan the default foreground, orchid dim (`TERM_TINT`) |
| any other hex, `rgb()`, `hsl()` | (not a kit colour) | the default foreground |
| a theme key's name (`success`, `claude`) | as the theme says | itself |
| `FILE_TYPE.*` (a `Duo`: light and dark) | this file's type (IntelliJ's New UI icon palette), on a file tree's icons only | none: `k.icon` draws file icons dim, as a type is no state a theme key means |

`FILE_TYPE` is the one group that isn't a status: a file tree's icons take it
(`k.icon(key, FILE_TYPE.typescript)`), never text, a header, a control or the
upstream's host icon, which stay grey. Each entry is a light and a dark value
from intellij-community's expui icons (Apache 2.0); the SVG picks one by the
page's colour scheme, the dark where it can't tell. `Kit/File Types` in
Storybook shows them on both.

A bar's parts are solid theme colours, one glyph (`━`): neighbours differ by
tone (default foreground, dim, a theme key), as `TERM_TINT` alternates them.
Never shades or dithers (`▓ ▒ ░`): real terminal fonts draw them as a
checkerboard. Put two parts the same tone apart, or give one a ramp shade.
`isKitColor(color)`
says whether a colour is one of the kit's tokens or data (a GitHub label's hex).
The one place data's own hex reaches the terminal is `pill`'s one-cell `■`
swatch; its name is drawn in the default foreground.

Structure has no colour: a section title is bold in the default foreground.
(The brand orange `claude` on every title read as loud in a real terminal; no
kit primitive draws it.) Everything that says how something is (done, failed,
near a limit, live, merged) is a status colour from the table above. Text
steps down by the roles under "The look", not by more colours. Uppercase only
captions. Never a grey hex on the terminal: use dim. No italics at all: real
terminal fonts draw them oddly and some not at all (a test checks no role is
italic).

### The look (rules)

The terminal draws one look, "rules" (after lazygit and gh-dash), kept quiet:
restraint over emphasis. The kit applies it; a mod never picks colours or
weights for a header or a reading's text itself.

```
◕ Context     31% of 200k ─────────────────────────── ▾
  ━━━━━━━━━━━━━━━╸─────────────────────────────────────
  ━ System   17.3k   ━ MCP        6.4k   ━ Messages 37.3k
  ─ Free      106k   ─ Buffer      33k

◔ Limits      96% weekly ──────────────────────────── ▸
```

Header anatomy, left to right: the icon (dim, in the 2-cell gutter the body is
indented by, so the title lines up with the readings under it), the title (bold,
default foreground) in a 10-cell column, 2 cells, the figures, one cell, a dim
`─` rule, one cell, then the fold arrow last, flush right (dim, a Button when
the section folds; it never gives way). A header without an icon starts its
title at the edge, where the icon would be. Every header's figures start on the
same column, right after the titles, so the eye reads `Context 31%` without
crossing the pane; the rule only takes the room left. Without figures, the rule
follows the title. Narrow, the title's column gives way first (down to 12 cells
of title), then the figures are cut with `…`. A header whose right side is
controls (`keepRight`) keeps them on the right, the rule between and the arrow
after them. The desktop's band reads the same way: icon, title, then the figures
and the arrow (▼ ▶︎, a Button's label) at its right end; the body starts just
inside the icon's column.

The text roles are `TERM_ROLES` in `kit/ui.tsx`, the one place to tune the
hierarchy. Two tones and one weight:

| Role | What it is | Drawn |
| --- | --- | --- |
| title | a section's name | bold |
| label | what a value is: a reading's, a prop's, a legend entry's label | dim |
| value | the figure or word that answers: a reading's figure, a prop's value, a legend's figure, list text | plain |
| strong | the one figure per section that matters: a header's first figure | bold |
| secondary | text still read, after the main text: a list row's note | dim |
| meta | text scanned past: units, ages, counts on a row's right, captions | dim |

A figure in a status colour keeps its role's weight and takes the status's
colour (`4 failed`: a plain red figure, a dim unit). Put the figure that matters
first in a `summary`: it's the bold one.

Do:
- Let the kit draw headers, readings, props, legends and list rows; they apply
  the roles.
- Say each fact once. A header's figures restate a body that's folded; when
  they only restate the readings under them (Limits' fullest window), pass
  `restated: true` so they show only while the body is hidden. Don't list the
  same PR in two sections, or a merged PR's state as both its icon and a word.
- Keep a row's actions beside what they act on (`item`'s `after`), not alone on
  the far edge.
- Say a state with its status colour and glyph (`k.status`, `STATUS`).

Don't:
- Colour structure: no `claude` orange, no status colour on a title, rule or icon.
- Bold anything but the title and the one strong figure: not labels, notes,
  list text or every figure; change `TERM_ROLES` instead if the hierarchy needs tuning.
- Use italics, or add a tone.
- Draw your own rule, leader dots or band in a header.

The alternatives it was picked from (`inspector`; `panel`, teal title bands;
`ledger`, dot leaders and dim capital labels) are in commit ab3a37a, with the
`Kit/Terminal Directions` story that compared them. Storybook's `Kit/Terminal
Look` draws the look on a dark and a light terminal at 40 and 60 columns. It's
an emulator: judge a look in a real terminal too (see "Checking it in a real
terminal" below).

### Glyphs

All one cell wide, from blocks monospace fonts carry; none with Unicode's
Emoji property (no ⚠ ⚡ ⚒ ⏱ ↕ ◼ ⬛ ✅): some terminals draw those as emoji, two
cells wide. Check a new one with `bun -e "console.log(/\p{Emoji}/u.test('⌘'))"`
(false is right). Every glyph in `kit/tokens.ts`, `kit/icons.ts` and the kit's
terminal drawing passes; tools is `⌘`, fold `⇕`, and the perf footer's uptime `◷`.

A test holds this: `mods/overview/hooks/kit.test.ts` (the kit's own tests live
in overview, since the build leaves tests in `kit/` out; put kit-level tests
there). It walks `GLYPH`, `STATUS`, `TERM_GLYPH`, `METER`, `FOLD`, `TREE`,
`MARK`, `PERF_GLYPH` and the spark glyphs for the Emoji property and variation
selectors, and draws every primitive on the terminal checking that no raw hex
colour (besides a pill's swatch) and no U+FE0E/U+FE0F arrives. A new glyph goes
in one of those tables so the test sees it. `fold()` (▼ ▶︎, with U+FE0E) is the
desktop's only; the terminal draws `FOLD`.

Some geometric glyphs (`◐ ◌ ◉ ○ ◆ ■ ▲`) are East Asian Ambiguous width: one
cell by default, two in CJK-configured terminals. Keep how many kinds we use small.

| Use | Glyphs |
| --- | --- |
| Fold | `▾` open, `▸` closed (`FOLD`), dim; the desktop keeps ▼ ▶︎ |
| Gauge (`k.gauge`, a reading's) | `━` fill to the half cell `╸`, on a dim `─` rail |
| Bar (`k.bar`) | one row: each part `━` in its own solid colour to the half cell `╸`; `room` parts (free space, a reserve) `─` in their colour; the rest a dim `─` rail. No `█ ▓ ░` |
| Scale (`k.scale`) | dim `╵` ticks at 0/25/50/75/100%, `▴` marker |
| Columns (`k.columns`) | `▁▂▃▄▅▆▇█`, rows tall, to the eighth of a row |
| Sparkline (`k.spark`) | Braille `⣀⣤⣶⣿` (U+2800 block, `SPARK`), two points a cell, four levels a row; `glyphs: 'blocks'` draws the columns' eighths |
| Legend key (`k.swatch`) | `■`; keying a bar (`line: true`), the bar's own `━`, `─` for room; `●` on the desktop |
| Selected row (`item`) | `▌` (`MARK.selected`) in `suggestion`, in a one-cell gutter |
| Key hints (`k.hints`) | ` · ` between pairs (`MARK.sep`), `…` (`MARK.more`) when some are dropped |
| Stale figures (`summary`) | dim `↻` (`MARK.stale`) and the age; failed refresh amber `▲` |
| Rail (`k.rail`) | `▎` |
| Status (`STATUS`, `k.status`) | running `◐` blue, pending `◌` blue, done `✓` green, failed `✕` red, warn `▲` amber, merged `◆` purple, stopped `■` dim, idle `○` dim |
| Tree (`TREE`, `k.tree`) | `├─` `└─` `│ ` |
| Icons (`k.icon`, `TERM_GLYPH`) | issue `◉`, comment `≡`, PR open `⇡`, merged `◆`, closed `✕`, draft `◌`, file `□`, folder `▸`/`▾`, commit `○`, push/up `↑`, alert `▲`, trash `⌫`, search `⌕`, sync `↻`, home `⌂`, eye `◎`, fold `⇕`, events `↯`, tools `⌘`; a GLYPH is itself; anything else `•` (never the icon's name) |

### Each primitive on the terminal

- `section`: `◔ Title     figures ──── ▾`, as under "The look". Dim icon, bold
  title in its column (key `title`), the figures (key `right`), the rule (key
  `rule`), then the dim arrow last (key `fold`; a Button when `onToggle`, key
  `toggle-<id>`), which never gives way; the title's column
  gives way first, then the figures truncate. No band or box. `restated: true`
  draws the figures only while the body is hidden (folded, or under the floor),
  for figures that only restate the body. With `keepRight: true`
  the right side (figures, buttons) keeps its natural width and only the title is
  cut, with an ellipsis: use it when the right side is controls that must all
  show (filetree's header buttons, a launcher row), and size that side to fit the
  row yourself (the launcher drops its least telling parts first). Don't cut a
  title by hand. The desktop draws the same with or without it. `loading: true`
  with no `right` puts the pending `◌` in the figure slot (see "States"). Below
  30 columns only the header draws (see "Grid").
- `summary`: the first figure bold (strong), the rest plain (each in its status
  colour if any), units dim, 2 apart, as
  one line of text: too narrow, it's cut wherever that falls and ends in `…`
  (`4 fa…`), never a figure clipped without one. `summary(items, { loading, age,
  failed })` adds the section's state before the figures (see "States").
- `reading`: as the grid above. Under 6 cells of gauge the label narrows to 6,
  then the gauge is left out and the figures stay.
- `gauge`, `bar`, `scale`, `axis`, `columns`: drawn to the exact width as above.
  A bar is one row, the gauge's heavy line in each part's solid colour; give
  free space or a reserve as `room: true` parts, drawn as the light rail in
  their colour (the context bar's buffer is an amber `─` at its end, which
  replaces a scale row's compaction mark). One row says it: don't add a scale
  and an axis under a bar whose header already gives the total.
- `spark(values, { width, height, color, max, glyphs })`: a series over time
  (activity, tokens a minute, a server's CPU), newest on the right edge. Braille,
  two points a cell and four levels a row, filled from the bottom, so the last
  2 × width points show; `height` rows (1 by default); scaled to `max` (the
  series' largest by default); quantity colour by default. `glyphs: 'blocks'`
  draws the `columns` eighths instead, a point a cell: for a font without
  Braille, or counts that should read as bars. The desktop draws an SVG line.
  Use `columns` for counts per bucket, `spark` for a series over time.
- `legend`: a compact grid, row by row, 3 cells apart: as many columns as fit
  with labels up to 10 cells (3 at most), then each column takes its share of
  the row up to what its longest label, figure and note need, so a long label
  shows whole when there's room and is cut with `…` only when there isn't; a
  label stays close to its figure however wide the pane. Labels dim, figures plain, a `note` (`!2` failed) after the figure.
  `legend(key, items, maxCols, { bar: true })` for a legend that keys a `bar`
  (its items in the bar's order, `room` ones included): keys `━`, and `─` for room.
- `prop`: dim label in the reading's label column, plain value left-aligned after it
  and cut at the edge (the desktop puts the value on the right edge).
  `prop(key, label, value, { path: true, width })` cuts a path or branch name in
  the middle, keeping its end (`src/…/view.tsx`), to fit `width` (a section
  body's by default). `middle(text, cells)` in `@kit/format` does the cut.
- `item` (new): the list row every list uses: `[tree][lead] text  note ……… right`.
  `lead` is a status kind, an icon key or an element; `right` holds meta figures
  (dim) and elements (a status). `after` is an element right after the text and
  note, 2 cells on, that never gives way: a row's `actions`, beside what they
  act on. Use it for issues, tasks, PRs, files.
  The `note` is always secondary (plain dim), whatever `textColor` or `bold` the text has.
  When the row runs out of room the text gives way first, down to its first 6
  cells (with `…`); then ranked right parts drop; then the right cluster is cut
  from its end, the last element first (a string with `…`), so nothing runs
  past the edge.
  - Drop order: a right part may be `{ part, drop, cells? }` (`RightPart`). The
    highest `drop` leaves first (ties: the later one), then the next, until the
    row fits. Parts with no `drop` are never dropped, only cut. Rank by how
    little a part tells (an age before a CI mark), whatever order they're drawn
    in. Give `cells` for an element the kit can't measure (strings, Texts, rows
    of them and plain Buttons it measures itself).
  - Selection: in a list that takes the keyboard, pass `selected` (true or
    false) on every row. Each row then keeps a one-cell gutter; the selected
    one has `▌` in `suggestion` there and bold text. While the pane isn't
    focused (`kit`'s `focused`, or the row's own `focused`), the mark is dim and
    the text keeps its own weight. The desktop gives the selected row the
    selected tile's tint. Never mark selection with `claude` orange.
  - `path: true`: the text is a path or branch name, cut in the middle
    (`src/…/view.tsx`) rather than at the end.
- `status` (new): a status's glyph and word in its colour.
- `note` (new): `empty` and `loading` lines dim; `error` a red `✕` and the message
  plain. One line, cut at the edge; `k.note(key, text, kind, { lines: 2 })` for a
  long message (why something failed): it breaks between words onto a second
  line, which is cut with `…`. It fits `k.width`; pass `width` when it sits deeper.
  The app surfaces wrap it. An error's second line names the fix
  (`Couldn't read issues` / `run gh auth login`), not just what went wrong.
- `action`/`actions` (new): plain Buttons; `quiet` ones dim at rest; `hotkey`
  draws `1: Proceed`. Actions are a cluster on the right edge, 2 apart.
  `autoFocus: true` puts the focus on that action when the site takes the
  keyboard, so Enter presses it: give it to the safe choice (blast-radius's
  Cancel). `tone: 'danger'` draws an action that destroys something with its
  label in the failed colour (`error`; red on the desktop), as blast-radius's
  Proceed.
- `hints(key, [{ key, label }], { width })`: the key-hint line under a pane
  that takes keys. Keys plain, what they do dim, ` · ` apart, on one line of
  `width` (a section body's by default); pairs that don't fit drop from the end
  and the line ends in a dim `…`, so put the most used first. Drawn only on the
  terminal and only while the pane is focused; the desktop draws nothing, as its
  controls are buttons. Never put a key inside a word (`[r]efresh`): `r refresh`.
- `pill`: a `■` swatch in the label's own colour and the name in the default
  foreground (a GitHub label's hex is data that may not read on the theme, so
  it only ever tints that one cell; a kit token draws as its theme key).
- `tile(key, children, { selected, focused })`: a blank row above, no fill, and
  no selection mark on the terminal (a terminal list that selects uses `item`
  rows). The desktop fills a selected tile with a blue tint, half as strong
  while the pane isn't focused.
- `perf`, `share`: a dim glyph and the figure; slow figures amber or red.

Storybook's `Kit/Terminal Fitting` and `Kit/Terminal States` sheets show each of
these at 30, 40, 60 and 100 columns; `Kit/Terminal Selection`, `Terminal Hints`,
`Terminal Stale States`, `Terminal Drop Order`, `Terminal Spark` and
`Terminal Fallbacks` show the newer ones.

### States

A section says how fresh its data is in its figure slot, so it shows even when
the section is folded:

- Loading, before the first data: `section({ loading: true })` (or
  `summary([], { loading: true })`) puts the pending `◌` (blue) where the
  figures will go. In the body, a dim `note(..., 'loading')` line.
- Stale, last-good figures kept through a refresh: `summary(items, { age: '2m' })`
  draws a dim `↻ 2m` before the figures.
- Failed refresh: `summary(items, { failed: true, age: '2m' })` draws an amber
  `▲` and the dim age before the figures. Keep the figures and the body; don't
  swap the body for an error. The state comes before the figures so a cut
  never takes it.
- Failed with nothing to show: an error `note`, its second line naming the fix.

### Do and don't

- Do draw the terminal with the kit's components; a `renderTerminal` that only
  calls `Text` with glyph strings is a sign something's missing from the kit:
  add it there.
- Do pass `bodyColumns` to `kit()`; everything sizes from it. Pass
  `{ focused: e.props.isFocused }` too when the pane takes keys.
- Do put `wrap="truncate"` and `minWidth={0}` on every text that can be long:
  a terminal line never wraps.
- Don't draw boxes, borders or backgrounds around content (the one exception is
  a band that must stop the person, like blast-radius's hold: one round border
  in the status colour).
- Don't use hex greys or the desktop's `GRAY` tones on the terminal; use dim.
  Don't pass a raw hex to a terminal `Text` at all: go through `k.ink`.
- Don't mix glyph sets: one failed mark (`✕`, not `✗`), one running mark (`◐`).
- Don't size bars from a guess (`columns - 20`); let the kit fill the width.

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

## Checks, in order

1. `bun build.ts` (after any change under `mods/` or `kit/`).
2. `claude plugin validate plugins/<name>`, and `claude plugin validate .` for the marketplace.
3. `bunx tsc -p plugins/<name>` (needs the laid types; see `headless-verification`).
4. `claude plugin test plugins/<name>` when the mod has a `*.test.ts`.
5. Look at it in Storybook (`storybook-prototyping`), then in the real app.

All must exit 0. Commit `mods/` and the rebuilt `plugins/` together.
