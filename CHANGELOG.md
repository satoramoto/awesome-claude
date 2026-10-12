# Changelog

## Unreleased

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
