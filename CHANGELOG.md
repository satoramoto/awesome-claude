# Changelog

## Unreleased

- **Kit from zen** (overview 0.7.5, issues 0.3.5, launcher 0.2.5, lab 0.2.5, filetree 0.5.5, blast-radius 0.4.5): the kit and the Storybook bench now live in zen's Claude Code harness (`github:satoramoto/zen`, `src/harness/claude-code/`), pinned as the `@satoramoto/zen` dev dependency. `bun build.ts` copies the kit from there into each mod (or from the zen checkout `ZEN` names); `kit/` and the bench copies in `playground/` are gone, and the playground and Storybook draw with zen's bench through the `@bench` alias. Each compiled mod gains the kit's `skin.ts` and `skins.ts`: it wears zen's `claude-code` skin, the same look as before. Storybook keeps the stories that draw this repo's mods (the kit's own sheets are in zen's Storybook, under Harness/Claude Code/Kit), and the skills point to zen's `docs/harness-claude-code.md` for the kit, its design rules and the engine's limits.

- **Kit** (overview 0.7.4, issues 0.3.4, launcher 0.2.4, lab 0.2.4, blast-radius 0.4.4; filetree 0.5.4 for the kit copy alone): the column view can be switched off. A wide desktop pane's footer (the perf band in `overview`, a band of its own in the others) ends in a quiet `columns` action; pressed, the pane draws one stack at any width and the action reads a dim `single column`, pressed again the columns come back. It shows only where the pane is wide enough to split, never at a sidebar's width or on the terminal. Each mod keeps the setting in its own state (`columns`, on by default); `lab` and `blast-radius` gain a state contract for it. The kit takes it as `kit(..., { flow: { on, toggle } })`, and `flow`/`flowColumns` take `{ single: true }`.

- **Kit** (overview 0.7.3, issues 0.3.3, launcher 0.2.3, lab 0.2.3, filetree 0.5.3, blast-radius 0.4.3): wide desktop panes split into columns sooner: `FLOW_MIN` 56 to 40, so two columns from 82 reported columns (about 640px) and three from 124 (about 970px).
- **Kit** (overview 0.7.2, issues 0.3.2, launcher 0.2.2, lab 0.2.2, blast-radius 0.4.2; filetree 0.5.2 for the kit copy alone): a wide desktop pane lays its sections out in columns. `flow(Box, surface, columns, key, blocks)` (and `k.flow(key, blocks)`) reads the pane's width from `bodyColumns` and, past two columns of `FLOW_MIN` (56) plus the gutter, splits the blocks into two columns, past three into three (`FLOW_MAX`): from 114 and 172 reported columns, about 900px and 1400px. Blocks are never split; they read down then across, cut where the columns end most even by an estimate of each block's rows. At a sidebar's width, and always on the terminal, the blocks come back as they were. `overview` flows Context, Limits, Activity, Agents, Workspaces and Accounting; `launcher` its configurations under the file's line; `issues` its tiles under the repository's line and the add field; `blast-radius` the paths it lists, the head, summary and buttons staying across; `lab` its index's groups and its gallery's experiments. `filetree` stays one column. Storybook's Width gains 115 and 180, with a wide story per mod.
- **Kit** (overview 0.7.1, issues 0.3.1, launcher 0.2.1, lab 0.2.1, filetree 0.5.1, blast-radius 0.4.1): a section heading's fold chevron sits last, flush right, after the icon, title and figures, on the desktop and the terminal.
- **Kit** (all six mods, same versions): buttons answer the first click. The engine gave every Button a new press handle on each redraw and freed the old one, so a click that landed just after a redraw (the click focusing the pane, a timer's write) did nothing. `holdButtons(els, e)` hands each render hook a table whose Buttons keep their handle while their key, props and children stay the same, a press running the latest `onPress`; every mod draws through it. `overview` redraws for agents' elapsed times only when a card's minute changes, and skips a resources sample equal to the last; `launcher` redraws on a refresh only when what it draws changes.
- **`overview`** (0.7.1): an agent's card is one row: an icon for its kind of agent (code, tools, zap, checklist, telescope, tasklist, robot, book) coloured by its status, with the type and status as its tooltip, then the title and elapsed time; while it runs, a second row says what it's doing now: an icon for the kind of tool, its name, then its command or path dim and cut in the middle. The terminal draws one glyph per kind instead. Activity no longer shows failed calls. The kit gains Octicons for these (terminal, pencil, globe, plug, dot-fill, code, tools, zap, checklist, telescope, tasklist, hubot, book).
- **Kit and Storybook bench**: the bench now draws the desktop as the engine
  does: a Button shows its label only (dim with `dimColor`), never its
  children; every Input draws its submit button; vertical margin, padding and
  row gap are half a row; and a `transparent` border is drawn in the text
  colour, as the desktop does. The kit therefore draws no outlines (plain
  fills, no round borders) and header bands have a fixed height
  (`BAND_ROWS`), so a row's Button or Link no longer changes its height.
  It also gains IntelliJ file-type colours (`FILE_TYPE`), host icons
  (GitHub, GitLab, Forgejo, a cloud), and danger and quiet actions drawn as
  the desktop shows them.
- **`overview`** (0.7.0): on the desktop, the kit's flat headers without
  outlines; a branch's hide button is a dim label.
- **`issues`** (0.3.0): on the desktop, Refine and Select are dim labels, and
  Selected is a blue word under a blank-labelled Button; no outlined tiles.
- **`blast-radius`** (0.4.0): on the desktop, Proceed shows in red (the kit's
  danger action) instead of a red child the app never drew.
- **`lab`** (0.2.0): on the desktop, the index rows put each experiment's note
  beside its button, since the app draws a Button's label only.
- **`filetree`** (0.5.0): the desktop header puts search first; the upstream
  shows as its host's icon (GitHub, GitLab, Forgejo, otherwise a cloud; none
  for a local upstream); file icons use IntelliJ's file-type colours; failed
  host lookups are retried. On the terminal, search comes first and the
  upstream is a host mark.
- **`launcher`** (0.2.0): two configurations sharing a port are told apart by
  the process listening on it (its command, parents and folder); the other
  reads "port taken". A port held elsewhere offers Take over (Stop then
  signals that process) and Kill (two presses, SIGTERM then SIGKILL).
  Running rows offer Stop and Restart. Before any signal, the launcher checks
  that the process still holds the port and has the start time and command it
  had when it was recorded; if not, it refuses and says why. Kill refuses on a
  port that several processes listen on, and names them. A failed Stop keeps
  the server taken over.
- **`blast-radius`** (0.3.0): the terminal hold is drawn with the kit's
  terminal design system, in its calmer look: dim labels, plain values, key
  hints when focused and paths cut in the middle.
- **`filetree`** (0.4.0): the terminal tree is drawn with the kit's terminal
  design system, in its calmer look: theme keys only, a `▌` cursor,
  middle-cut paths and key hints.
- **`overview`** (0.6.0): ships what merged since 0.5.0 and never reached
  marketplace installs: the three greys, links without underline, and the kit's
  Octicons and other kit changes since.
- **`issues`** (0.2.0): ships linked PRs, label pills, Select, the three greys
  and the kit's Octicons, merged since 0.1.0; and the pane now opens on its own
  when a session starts (`/issues` opens it again).
- **`launcher`** (0.1.1): the pane opens on its own when a session starts
  (`/launcher` opens it again).
- **`lab`** (0.1.1): ships the kit changes merged since 0.1.0; the index opens
  on its own when a session starts.
- **CI** fails a pull request that changes a mod's compiled output in
  `plugins/<mod>/` without raising its version above the base's, so every change
  reaches marketplace installs. README's Install section says how to get updates
  and turn on auto-update.
- **`filetree`** (0.2.24): forked from
  [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree)
  at `bf8de32`, MIT, code unchanged.
- **`blast-radius`** (0.1.0): forked from
  [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius)
  at `569c528`, Apache-2.0, code unchanged.

## 0.1.0

The first release: the repository is a Claude Code plugin marketplace,
`awesome-claude`, with two mods. The repository's release is 0.1.0; each mod is
versioned on its own in its `plugin.json` (`overview` 0.5.0, `issues` 0.1.0).

- **`overview`** (0.5.0): a pane with the session at a glance, in sections:
  Context, Limits, Activity, Agents, Workspaces (the branches the session
  started, with their pull requests) and Accounting, and a footer with the
  session's share of the machine's cpu, memory and network. Opens on its own
  when a session starts, or with `/overview`. Cells in the terminal, charts in
  the desktop app.
- **`issues`** (0.1.0): a pane with the open GitHub issues of the session's
  repository, newest change first, opened with `/issues`. Quick add; Refine
  (the session clarifies an issue with you and rewrites it) and Start (a
  subagent takes it) on each issue; select several to start them as a sprint.
- **The kit** (`kit/`): the shared components, colors, glyphs and number
  formatting the mods draw with.
- **The build** (`bun build.ts`): compiles `mods/` into self-contained plugins
  in `plugins/`, copying the kit into each.
- **The playground** (`bun run playground`) draws every mod live with sample
  data on each surface; **Storybook** (`bun run storybook`) shows each kit
  component and mod scenario with controls.
- **CI** builds the mods, checks `plugins/` is committed up to date, validates
  each mod and the marketplace, and checks the marketplace's versions match each
  mod's `plugin.json`.
