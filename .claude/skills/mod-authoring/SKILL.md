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

Parts that sit next to each other in a bar also differ by glyph (`█`, `▓`), so
shades that come out the same on a theme still read apart. `isKitColor(color)`
says whether a colour is one of the kit's tokens or data (a GitHub label's hex).
The one place data's own hex reaches the terminal is `pill`'s one-cell `■`
swatch; its name is drawn in the default foreground.

Structure has one colour of its own: `claude`, the brand orange Claude Code's
chrome is drawn in, which no status uses. It marks section titles and nothing
else. Everything that says how something is (done, failed, near a limit, live,
merged) is a status colour from the table above. Text steps down by the five
roles under "The look", not by more colours. Uppercase only captions. Never a
grey hex on the terminal: use dim. Italic never carries a role alone: meta is
dim and italic, since some terminals don't draw italic (a test checks it).

### The look (rules)

The terminal draws one look, "rules" (after lazygit and gh-dash). The kit applies
it; a mod never picks colours for a header or a reading's text itself.

```
▾ ◔ Context ─────────────────────────── 31% of 200k
  System        ━━━━━━━━━━━──────────   17.3k
▸ ⌘ Activity ──────────────── 10 peak  4 failed
```

Header anatomy, left to right: the fold arrow (dim, a Button when the section
folds), the icon (dim), the title (bold orange), one cell, a dim `─` rule that
fills whatever room is left, one cell, the figures. The rule grows from no width
and is cut at its box, so it always ends right where the figures start, at
every width; it never pushes them.

The five text roles are `TERM_ROLES` in `kit/ui.tsx`, the one place to tune the
hierarchy:

| Role | What it is | Drawn |
| --- | --- | --- |
| title | a section's name | bold, `claude` orange |
| label | what a value is: a reading's, a prop's, a legend entry's label | plain |
| value | the figure or word that answers: a reading's figure, a header's figures, a prop's value | bold |
| secondary | text still read, after the main text: a list row's note | dim |
| meta | text scanned past: units, ages, counts on a row's right, captions | dim italic |

A value in a status colour keeps its role's weight (bold) and takes the status's
colour (`4 failed`: bold red figure, dim italic unit).

Do:
- Let the kit draw headers, readings, props, legends and list rows; they apply
  the roles.
- Keep orange to the title word. The header icon is dim on purpose: a one-cell
  orange glyph reads too close to an amber status glyph (`▲`, `↑`) in the row
  beneath, and the two colours sit near each other in some themes.
- Say a state with its status colour and glyph (`k.status`, `STATUS`).

Don't:
- Colour anything else `claude`: not a figure, a glyph, a selected row or a
  link. Orange means "a section starts here".
- Use a status colour (amber above all) for structure, or orange for a status.
- Bold labels or notes, dim values, or add a sixth tone; change `TERM_ROLES`
  instead if the hierarchy needs tuning.
- Draw your own rule, leader dots or band in a header.

The alternatives it was picked from (`inspector`, today's former default;
`panel`, teal title bands; `ledger`, dot leaders and dim capital labels) are in
commit ab3a37a, with the `Kit/Terminal Directions` story that compared them.
Storybook's `Kit/Terminal Look` draws the look on a dark and a light terminal at
40 and 60 columns.

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
| Bar (`k.bar`) | `█` fill to the eighth cell `▏▎▍▌▋▊▉`, on a dim `░` track; parts alternate `█` and `▓` (`METER.alt`); a part ending mid-cell is drawn over the next part's colour |
| Scale (`k.scale`) | dim `╵` ticks at 0/25/50/75/100%, `▴` marker |
| Columns (`k.columns`) | `▁▂▃▄▅▆▇█`, rows tall, to the eighth of a row |
| Sparkline (`k.spark`) | Braille `⣀⣤⣶⣿` (U+2800 block, `SPARK`), two points a cell, four levels a row; `glyphs: 'blocks'` draws the columns' eighths |
| Legend key (`k.swatch`) | `■`; given the part's index, the bar's own `█` or `▓`; `●` on the desktop |
| Selected row (`item`) | `▌` (`MARK.selected`) in `suggestion`, in a one-cell gutter |
| Key hints (`k.hints`) | ` · ` between pairs (`MARK.sep`), `…` (`MARK.more`) when some are dropped |
| Stale figures (`summary`) | dim `↻` (`MARK.stale`) and the age; failed refresh amber `▲` |
| Rail (`k.rail`) | `▎` |
| Status (`STATUS`, `k.status`) | running `◐` blue, pending `◌` blue, done `✓` green, failed `✕` red, warn `▲` amber, merged `◆` purple, stopped `■` dim, idle `○` dim |
| Tree (`TREE`, `k.tree`) | `├─` `└─` `│ ` |
| Icons (`k.icon`, `TERM_GLYPH`) | issue `◉`, comment `≡`, PR open `⇡`, merged `◆`, closed `✕`, draft `◌`, file `□`, folder `▸`/`▾`, commit `○`, push/up `↑`, alert `▲`, trash `⌫`, search `⌕`, sync `↻`, home `⌂`, eye `◎`, fold `⇕`, events `↯`, tools `⌘`; a GLYPH is itself; anything else `•` (never the icon's name) |

### Each primitive on the terminal

- `section`: `▾ ◔ Title ──── figures`, as under "The look". Dim arrow (a Button
  when `onToggle`, key `toggle-<id>`), dim icon, bold orange title, the rule (key
  `rule`); the title keeps up to 12 cells, then it and the figures truncate
  together. No band or box. With `keepRight: true`
  the right side (figures, buttons) keeps its natural width and only the title is
  cut, with an ellipsis: use it when the right side is controls that must all
  show (filetree's header buttons, a launcher row), and size that side to fit the
  row yourself (the launcher drops its least telling parts first). Don't cut a
  title by hand. The desktop draws the same with or without it. `loading: true`
  with no `right` puts the pending `◌` in the figure slot (see "States"). Below
  30 columns only the header draws (see "Grid").
- `summary`: figures bold values (in their status colour if any), units dim italic meta, 2 apart, as
  one line of text: too narrow, it's cut wherever that falls and ends in `…`
  (`4 fa…`), never a figure clipped without one. `summary(items, { loading, age,
  failed })` adds the section's state before the figures (see "States").
- `reading`: as the grid above. Under 6 cells of gauge the label narrows to 6,
  then the gauge is left out and the figures stay.
- `gauge`, `bar`, `scale`, `axis`, `columns`: drawn to the exact width as above.
  A bar's parts alternate `█` and `▓`, so neighbours read apart without colour.
- `spark(values, { width, height, color, max, glyphs })`: a series over time
  (activity, tokens a minute, a server's CPU), newest on the right edge. Braille,
  two points a cell and four levels a row, filled from the bottom, so the last
  2 × width points show; `height` rows (1 by default); scaled to `max` (the
  series' largest by default); quantity colour by default. `glyphs: 'blocks'`
  draws the `columns` eighths instead, a point a cell: for a font without
  Braille, or counts that should read as bars. The desktop draws an SVG line.
  Use `columns` for counts per bucket, `spark` for a series over time.
- `legend`: as many columns as fit at 18 cells (one at 30 columns, two at 40+).
  `legend(key, items, maxCols, { bar: true })` for a legend that keys a `bar`
  (its items in the bar's order): its keys are the bar's own `█`/`▓` in turn.
- `prop`: plain label in the reading's label column, bold value left-aligned after it
  and cut at the edge (the desktop puts the value on the right edge).
  `prop(key, label, value, { path: true, width })` cuts a path or branch name in
  the middle, keeping its end (`src/…/view.tsx`), to fit `width` (a section
  body's by default). `middle(text, cells)` in `@kit/format` does the cut.
- `item` (new): the list row every list uses: `[tree][lead] text  note ……… right`.
  `lead` is a status kind, an icon key or an element; `right` holds meta figures
  (dim italic) and elements (a status, `actions`). Use it for issues, tasks, PRs, files.
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

## Checks, in order

1. `bun build.ts` (after any change under `mods/` or `kit/`).
2. `claude plugin validate plugins/<name>`, and `claude plugin validate .` for the marketplace.
3. `bunx tsc -p plugins/<name>` (needs the laid types; see `headless-verification`).
4. `claude plugin test plugins/<name>` when the mod has a `*.test.ts`.
5. Look at it in Storybook (`storybook-prototyping`), then in the real app.

All must exit 0. Commit `mods/` and the rebuilt `plugins/` together.
