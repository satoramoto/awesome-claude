# Changelog

## Unreleased

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
