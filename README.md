# awesome-claude

Mods for [Claude Code](https://claude.com/claude-code). A **mod** is a Claude Code
plugin that adds interface to Claude Code itself (a pane, a slash command) through
the engine's hooks API. This repository holds our own mods, forks of others'
(each kept under its own license, with a link back), and is a plugin marketplace
that installs them.

The panes draw in the desktop app (as a side pane, with charts) and in the
terminal (a simpler pane of text cells). Tested on Claude Code 2.1.296, the
version CI pins.

## The mods

| Mod | What it shows | Opens with | Needs |
| --- | --- | --- | --- |
| `overview` | the current session at a glance: context, limits, activity, agents, the branches it started and their pull requests, cost | on its own when a session starts; `/overview` opens it again | `git` for Workspaces; `gh` signed in for pull requests |
| `issues` | the open GitHub issues of the session's repository, newest change first, with actions on each | on its own when a session starts; `/issues` opens it again | a GitHub repository; `gh` signed in |
| `launcher` | the project's dev servers from `.claude/launch.json` (the desktop app's preview list), each with its state, URL, Start, Stop and Restart, and its output | on its own when a session starts; `/launcher` (or `/preview`) opens it again; `/launcher start <name>`, `/launcher stop <name>` | a `.claude/launch.json`; `lsof` to tell which ports answer |
| `lab` | for mod authors: 77 experiments probing what the engine draws (SVG gradients and filters, animation, hover, `Client` modules, every element), with the engine's verdict on each surface in `mods/lab/verdicts.json` | the index on its own when a session starts; `/lab`, `/lab <id>`, `/lab gallery` | nothing |

### Forked mods

Copies of other people's mods, changed here to fit these. Each keeps its
original license and author; its README opens with where it came from, the
upstream commit it was taken at, and what this fork changed.

| Mod | What it does | Original | License |
| --- | --- | --- | --- |
| `filetree` | an IDE-style file tree of the session's folder: git status and lines changed per file, and a shimmer on what Claude reads, writes and commits. `/filetree` opens it | [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree), by Kurt Buhler | [MIT](mods/filetree/LICENSE) |
| `blast-radius` | holds a risky shell command (`rm -rf`, `git reset --hard`, `git clean`, force push, migrations) and shows what it would change, with Proceed and Cancel | [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius), by Anthropic | [Apache-2.0](mods/blast-radius/LICENSE) |

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

Opens by itself when a session starts; `/issues` brings it back. Lists the open
issues of the session's repository (read with `gh issue list`).

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

### `/launcher`

The desktop app's preview launcher, in a pane that works in the terminal too.
Opens by itself when a session starts; `/launcher` brings it back.
It lists every configuration in the project's `.claude/launch.json` (the
session's folder, or the nearest one above it up to the git root), one row each:
its name, its state, its URL once the port answers, and Start, Stop and Restart.

- **States**: stopped (grey); starting (blue: started here, its port not
  answering yet); running (green, with `http://localhost:<port>`); running
  elsewhere (green: something this session didn't start answers on the port,
  such as the desktop app or another session; it can't be started twice); failed
  (red: it exited with an error, and its row unfolds to show why).
- **Start** runs `runtimeExecutable runtimeArgs…` in the configuration's `cwd`
  (the project root by default) with `PORT` set to its port and its `env` over
  that. With `autoPort`, a taken port moves it to the next free one.
- Unfold a row for its command, its exit code, and the tail of its output (the
  last 200 lines are kept, colours stripped).
- From the prompt: `/launcher start <name>`, `/launcher stop <name>`,
  `/launcher restart <name>`, `/launcher list`. Each answers in text, so they
  work without the pane. `/preview` does the same.
- Which ports answer comes from `lsof` (an HTTP request to each port where
  `lsof` isn't installed), every 2 s while the pane is shown, and not at all
  while it isn't.
- Stop frees the port: checked with `npm run serve` starting a `node` server,
  ending the spawn loop ends the grandchild `node` too, so its port was free at
  once.

The servers it starts are children of the mod: they end when the session ends,
and when the mod reloads (`/reload-plugins`, or a rebuild with hot reloading
on). Servers started elsewhere aren't touched; Stop is only for the ones this
session started.

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

### Getting updates

An installed mod updates only when its `version` changes; every release of a mod
raises it. To fetch the newest versions by hand, at the prompt:

```
/plugin marketplace update awesome-claude
/plugin update overview@awesome-claude
```

or from a shell: `claude plugin marketplace update awesome-claude`, then
`claude plugin update overview@awesome-claude` (and the same for each mod you
installed). The new version loads after a restart or `/reload-plugins`.

Auto-update is off by default for marketplaces other than Anthropic's. Turn it
on in `/plugin` → Marketplaces → awesome-claude → Enable auto-update, or with
`"autoUpdate": true` next to `source` in `extraKnownMarketplaces` in
`~/.claude/settings.json`:

```json
"extraKnownMarketplaces": {
  "awesome-claude": {
    "source": { "source": "github", "repo": "satoramoto/awesome-claude" },
    "autoUpdate": true
  }
}
```

Loading from a clone (`--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`, below) gets
no marketplace updates: `git pull` the clone instead. To pull at every session
start, a `SessionStart` hook in `~/.claude/settings.json`:

```json
"hooks": {
  "SessionStart": [
    { "hooks": [{ "type": "command", "command": "git -C ~/Code/satoramoto/awesome-claude pull -q --ff-only" }] }
  ]
}
```

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

With `bun run watch` running, a save under `mods/` (or in zen's kit, with `ZEN` set) recompiles and the
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
| `mods/<name>/` | a mod's source: `.claude-plugin/plugin.json`, `hooks/`, `types/`. Imports the kit as `@kit/…` |
| zen's `src/harness/claude-code/kit/` | the kit, from the pinned `@satoramoto/zen` dev dependency: components (`ui.tsx`), colors and glyphs (`tokens.ts`), number formatting (`format.ts`), icons (`icons.ts`), timing a mod's own work (`perf.ts`), skins (`skin.ts`, `skins.ts`) |
| `zen.ts` | where zen's kit and bench are: `node_modules/@satoramoto/zen`, or the zen checkout `ZEN` names |
| `plugins/<name>/` | the compiled mods: what Claude Code loads and the marketplace installs. Generated by `bun build.ts`; don't edit |
| `.claude-plugin/marketplace.json` | the marketplace: each mod in `plugins/`, at its `plugin.json` version |
| `playground/` | a browser page that draws every mod live with sample data, on each surface, through zen's bench; `playground/fixtures/` holds the sample data |
| `stories/` | Storybook stories: each mod's scenarios, the lab and the engine experiments |

Each mod is versioned on its own in its `plugin.json`. A new mod also gets an
entry in `.claude-plugin/marketplace.json`; CI fails if a mod is missing there or
its version differs from its `plugin.json`. Any change to a mod's compiled output
in `plugins/<mod>/` (a new zen pin that changes the kit included) raises its version, in `plugin.json`
and the marketplace, since installs only update when it changes; CI fails a pull
request that changes a mod's output without raising its version.

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

At http://localhost:6006 (set `PORT` for another). Each mod scenario
(`stories/<mod>.stories.ts`, from the playground's fixtures), drawn by zen's
bench. The toolbar picks the surface (desktop or terminal), the theme, the frame
and the pane width. The kit's own components and the skins have their stories in
zen's Storybook, under Harness/Claude Code.
Storybook is for how things look; the playground is for wiring up a whole mod
with the engine's checks running.

### Why a compiler

The engine reads a mod's source as it is and refuses any import from outside the
mod's folder (symlinks included). `build.ts` copies zen's kit into each compiled
mod and rewrites `@kit/…` to relative paths; nothing else changes, so the output
is still readable source and passes `claude plugin validate`.

### Drawing for the desktop

What the desktop accepts, found by probing the engine's validator (first on
2.1.293; the mods are tested on 2.1.296): whole percentages only (`25.5%` is
refused); `flexGrow` up to 10000; fractional heights and margins; no Box `hover`.
Borders: `round` draws rounded corners, and `single`, `double`, `bold` and
`classic` draw; `dashed` doesn't. SVG is drawn as an image the page scales, so it
blurs as the pane resizes: draw with boxes and text.

What it paints (measured on the real pane, 2.1.295): a horizontal unit is a
column (~7.8px), `height` a row (~19px), but vertical margin, padding and row gap
half a row (~9.5px); a `transparent` border colour draws in the text's colour;
a Button draws its `label` alone, never its children. zen's
[`docs/harness-claude-code.md`](https://github.com/satoramoto/zen/blob/main/docs/harness-claude-code.md)
("What the engine and the desktop accept") has the details, and Storybook draws
by the same rules.

## License

[MIT](LICENSE), except the forked mods, which keep their own licenses:
`mods/filetree` is MIT, copyright Kurt Buhler ([LICENSE](mods/filetree/LICENSE)),
and `mods/blast-radius` is Apache-2.0, copyright Anthropic PBC
([LICENSE](mods/blast-radius/LICENSE)).
