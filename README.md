# awesome-claude

Mods for [Claude Code](https://claude.com/claude-code). A **mod** is a Claude Code
plugin that adds interface to Claude Code itself (a pane, a slash command) through
the engine's hooks API. This repository holds two mods and is a plugin
marketplace that installs them.

The panes draw in the desktop app (as a side pane, with charts) and in the
terminal (a simpler pane of text cells). Tested on Claude Code 2.1.296, the
version CI pins.

## The mods

| Mod | What it shows | Opens with | Needs |
| --- | --- | --- | --- |
| `overview` | the current session at a glance: context, limits, activity, agents, the branches it started and their pull requests, cost | on its own when a session starts; `/overview` opens it again | `git` for Workspaces; `gh` signed in for pull requests |
| `issues` | the open GitHub issues of the session's repository, newest change first, with actions on each | `/issues` | a GitHub repository; `gh` signed in |
| `lab` | for mod authors: 77 experiments probing what the engine draws (SVG gradients and filters, animation, hover, `Client` modules, every element), with the engine's verdict on each surface in `mods/lab/verdicts.json` | `/lab`, `/lab <id>`, `/lab gallery` | nothing |

### Requirements

- **Claude Code**: tested on 2.1.296.
- **git**, for `overview`'s Workspaces section.
- **The [GitHub CLI](https://cli.github.com), signed in** (`gh auth login`), for
  `issues` and for the pull requests in `overview`'s Workspaces. Without it
  `overview` still draws everything else, and its Workspaces section shows a note
  in place of pull requests (`gh not installed`, or `gh not authenticated (run gh
  auth login)`); `issues` shows the same note in place of the list.
- **[Bun](https://bun.sh)**, only to build from source (`bun install`, then
  `bun build.ts`). Installing from the marketplace needs nothing else.

## What the panes do

### `/overview`

Opens by itself when a session starts; `/overview` brings it back after you close
it. Its sections, each folding open and shut:

- **Context**: how full the context window is, by kind, and the room left before
  compaction.
- **Limits**: your plan's usage limits and when they reset.
- **Activity**: tool calls per turn, sliced by tool, with failures.
- **Agents**: the session's subagents, each with its status, tokens and time.
- **Workspaces**: the branches the session started, each with its pull
  request's state, checks and lines changed. Pull requests are read with `gh`
  every 30 seconds while any is open.
- **Accounting**: the session's cost and model.

A footer shows the session's share of the machine's cpu, memory and network.

### `/issues`

Lists the open issues of the session's repository (read with `gh issue list`).

- **Quick add** creates an issue from a title alone, with an empty body
  (`gh issue create`).
- **Refine**, **Start** and **Sprint** send a prompt to the session, as if you'd
  typed it, and the session does the work with `gh`:
  - **Refine**: the session reads the issue, asks you about what's unclear,
    rewrites its body and labels it `refined`.
  - **Start**: one subagent takes the issue in its own worktree and branch off
    the default branch, and reports back when it's pushed. An issue not yet
    labelled `refined` asks first whether to refine it.
  - **Sprint** (select several issues): one subagent per issue in parallel, each
    in its own worktree, integrated on one `sprint/<date>` branch, then one PR
    for your approval with auto-merge off.

These prompts encode an opinionated way of working (worktrees, a subagent per
issue, an integration branch reviewed by you). Read
[`mods/issues/hooks/register.tsx`](mods/issues/hooks/register.tsx) for their
exact wording before you rely on them.

## Install

### From the marketplace

At the prompt of a Claude Code session in a terminal:

```
/plugin marketplace add satoramoto/awesome-claude
/plugin install overview@awesome-claude
/plugin install issues@awesome-claude
```

Pick a scope when asked (user scope loads the mod in every session). Each mod is
active straight away. Or from a shell: `claude plugin marketplace add
satoramoto/awesome-claude`, then `claude plugin install overview@awesome-claude`.

Run these from a terminal session; a mod installed at user scope then loads in
the desktop app too.

### Try it from a clone, for one session

The compiled mods are committed, so a clone runs as is. A folder of plugins
passed to `--plugin-dir` loads each one in it:

```bash
git clone https://github.com/satoramoto/awesome-claude ~/Code/satoramoto/awesome-claude
claude --plugin-dir ~/Code/satoramoto/awesome-claude/plugins
```

### From source, while changing the mods

```bash
git clone https://github.com/satoramoto/awesome-claude ~/Code/satoramoto/awesome-claude
cd ~/Code/satoramoto/awesome-claude
bun install
bun build.ts
```

Then point every session at the compiled folder, in `~/.claude/settings.json`,
with the full path to your clone's `plugins` folder:

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "/Users/you/Code/satoramoto/awesome-claude/plugins",
  "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
}
```

With `bun run watch` running, a save under `mods/` or `kit/` recompiles and the
session reloads the mod. These two variables are what this setup uses on Claude
Code 2.1.296; they may change in later versions. Don't also install the mods from
the marketplace, or each loads twice.

## Making a mod

[`AGENTS.md`](AGENTS.md) lists the commands and checks. The project's skills, which
Claude Code loads when working in this repository, hold the how-to:

- [`.claude/skills/mod-authoring/`](.claude/skills/mod-authoring/): writing a mod in this repository
- [`.claude/skills/storybook-prototyping/`](.claude/skills/storybook-prototyping/): designing how it looks in Storybook
- [`.claude/skills/headless-verification/`](.claude/skills/headless-verification/): checking it works without a person watching

| Folder | What it is |
| --- | --- |
| `mods/<name>/` | a mod's source: `.claude-plugin/plugin.json`, `hooks/`, `types/`. Imports shared code as `@kit/…` |
| `kit/` | shared code: components (`ui.tsx`), colors and glyphs (`tokens.ts`), number formatting (`format.ts`), icons (`icons.ts`), timing a mod's own work (`perf.ts`) |
| `plugins/<name>/` | the compiled mods: what Claude Code loads and the marketplace installs. Generated by `bun build.ts`; don't edit |
| `.claude-plugin/marketplace.json` | the marketplace: each mod in `plugins/`, at its `plugin.json` version |
| `playground/` | a browser page that draws every mod live with sample data, on each surface |
| `stories/` | Storybook stories: the kit's components and each mod's scenarios |

Each mod is versioned on its own in its `plugin.json`. A new mod also gets an
entry in `.claude-plugin/marketplace.json`; CI fails if a mod is missing there or
its version differs from its `plugin.json`.

### The playground

```bash
bun run playground
```

At http://localhost:5173 (set `PORT` for another). Every mod's `ui.render` hooks,
drawn with the scenarios in `playground/fixtures/<mod>.ts`, side by side in
desktop light, desktop dark and terminal, at any pane width. On each save it also
compiles and runs `claude plugin validate plugins/<mod>`, and shows the result in the
bar.

### Storybook

```bash
bun run storybook
```

At http://localhost:6006 (set `PORT` for another). Each kit component
(`stories/kit.stories.ts`) with controls for its inputs, and each mod scenario
(`stories/<mod>.stories.ts`, from the playground's fixtures). The toolbar picks
the surface (desktop or terminal), the desktop theme and the pane width.
Storybook is for how things look; the playground is for wiring up a whole mod
with the engine's checks running.

### Why a compiler

The engine reads a mod's source as it is and refuses any import from outside the
mod's folder (symlinks included). `build.ts` copies `kit/` into each compiled
mod and rewrites `@kit/…` to relative paths; nothing else changes, so the output
is still readable source and passes `claude plugin validate`.

### Drawing for the desktop

What the desktop accepts, found by probing the engine's validator (first on
2.1.293; the mods are tested on 2.1.296): whole percentages only (`25.5%` is
refused); `flexGrow` up to 10000; fractional heights and margins; no Box `hover`.
Borders: `round` draws rounded corners, and `single`, `double`, `bold` and
`classic` draw; `dashed` doesn't. SVG is drawn as an image the page scales, so it
blurs as the pane resizes: draw with boxes and text.

## License

[MIT](LICENSE)
