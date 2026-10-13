# session: a state machine attached to the main Claude session

Status: **draft for Ryan's approval.** Nothing is built yet.

## Outcomes

- Ryan describes changes; the session starts on them at once and stays
  responsive to his next message.
- Routing (who does the work, which checks run, whether a PR or review is
  needed) is decided by explicit rules in code, not by the model's
  interpretation of prose.
- Ryan can see at a glance what the session is doing and what's in flight.
- Every ask and transition is logged, so routing rules and modes can be
  benchmarked on real numbers.
- Working styles ("modes") are presets of one machine, so concepts are shared
  and new modes cost a record, not new code.

## Concepts

- **Session:** the main Claude session. It is either talking or busy in its
  own turn, and has a set of jobs in flight.
- **Ask:** one request from Ryan (a prompt from the composer).
- **Job:** the unit of work an ask becomes. It has an id, an owner, a mode, a
  state and a history of transitions. Several jobs can be in flight at once.
- **Owner:** who does a job: `self` (the main session in its own turn),
  `assistant`, `developer`, `test-engineer` or `workflow:<name>`.
- **Mode:** a named policy record (see Modes). It decides which lifecycle steps
  are required, optional or skipped, and what the guards enforce.
- **Event:** something observed through an engine hook (see Events).
- **Guard:** a check, run by a hook, that allows, denies or sends back a
  transition, according to the job's mode.

## Job lifecycle

One lifecycle, shared by every mode:

```
asked → routed → working → checked → [tested] → committed → [reviewed]
      → [pr_open → ci → merged → pulled] → done
```

A job can also go to `failed` (with a reason) or `cancelled` from any state.
`fixing` is entered from `ci` on a failure or conflict, and returns to `ci`
once pushed.

Bracketed steps exist in every mode. A mode marks each one `required`,
`on_request` or `skipped`.

| State | Meaning | Leaves on |
| --- | --- | --- |
| asked | an ask arrived and isn't routed yet | routing decision |
| routed | owner chosen | owner starts (first tool call or agent spawn) |
| working | owner is editing or running commands | owner reports, or its turn ends |
| checked | the mode's per-change checks passed (exit 0) | next required step |
| tested | tests written or run to a spec by a test-engineer | report per spec item |
| committed | change committed locally | next required step, or done |
| reviewed | reviewer verdict received and triaged | PR opened |
| pr_open | PR exists, auto-merge and Auto-fix are on | CI result |
| ci | CI running | pass → merged (via auto-merge); fail → fixing |
| merged | GitHub reports the PR merged | local fast-forward |
| pulled | the checkout is level with origin | done |

## Events (engine sources)

| Event | Hook or call |
| --- | --- |
| ask from Ryan | `prompt.submit` with `origin.kind = composer` |
| task or agent finished | `prompt.submit` / `session.receive` with origin `task-notification` |
| turn start / end (any agent) | `turn.start`, `turn.complete` (`agentId`, `durationMs`, `usage`) |
| tool call (any agent) | `tool.call` (`agentId` set inside a subagent) |
| agent spawned | `agent.spawn` (also a workflow's `agent()`) |
| subagent stopped | `classic.SubagentStop` |
| main turn about to end | `classic.Stop` (lists `background_tasks`) |
| PR events | `session.receive` with `source: github` (e.g. `outcome: merged`); `tool.call` on `mcp__ccd_pr__*` |
| mode change, manual transitions | `command.run` for the mod's commands; pane buttons via `$.prompt.submit` |

## Routing

1. Each ask from Ryan creates a job in `asked`, tagged with the session's
   current mode.
2. Questions (asks with no change implied) are answered by `self` and close
   as `done` without entering `working`. The model declares this by answering
   without editing; no classifier is needed.
3. A job is owned by `self` until the main turn makes more tool calls on it
   than the mode's `self_limit`. Past that, the guard sends the turn back from
   `classic.Stop` ("delegate the rest to the assistant") the first time, and
   the excess is logged as a routing miss.
4. Spawning an `assistant`, `developer` or `test-engineer` for a job moves it
   to `routed` with that owner. `agent.spawn` records the link from agentId to
   job.
5. A `developer` is allowed only when the job is marked a feature (by Ryan's
   wording "feature", or the `/feature` command). Otherwise the guard on
   `agent.spawn` rewrites a `developer` spawn to `assistant` and logs it.

## Modes

A mode is a record of these policy fields:

| Field | Values |
| --- | --- |
| `checks` | `build` / `build+compile` / `full` |
| `tests` | `skipped` / `on_request` / `required` |
| `review` | `skipped` / `on_request` / `required` |
| `pr` | `never` / `on_request` / `every_change` |
| `bumps` | `never` / `per_pr` |
| `self_limit` | tool calls the main turn may spend on a job before delegating |
| `commit_to_default_branch` | allowed / denied |

Presets:

| Field | scrappy | normal | production |
| --- | --- | --- | --- |
| checks | build | build+compile | build+compile |
| tests | skipped | on_request | required |
| review | skipped | skipped | required |
| pr | never | on_request | every_change |
| bumps | never | per_pr | per_pr |
| self_limit | 3 | 2 | 2 |
| commit_to_default_branch | allowed | allowed | denied |

6. `/mode <name>` switches the session's mode for new jobs. Jobs in flight
   keep the mode they started with. The switch is logged.
7. Each repo can name a default mode (in the mod's per-repo settings); a new
   session starts in it, or in `normal` if none is set.
8. A new mode is a new record. Adding one needs no new states or hooks.

## Guards

Each guard runs in a hook, reads the job's mode, and logs its decision.

9. **Commit on the default branch:** denied (`tool.call` on a `git commit`
   while on the default branch) when `commit_to_default_branch` is `denied`.
   The reason names the mode.
10. **PR without review:** when `review` is `required`, opening a PR
    (`gh pr create`) for a job not in `reviewed` is denied with the reason.
11. **PR settings:** every PR opened gets auto-merge (merge commit) and
    Auto-fix. If the turn ends with a PR open and either is off,
    `classic.Stop` sends the turn back.
12. **Push to a merged PR:** a push to a branch whose PR has merged is denied,
    with the reason "start a new branch from origin/main".
13. **Merged → pulled:** on a `merged` event for a job's PR, the mod
    fast-forwards the checkout if it is clean and on the default branch.
    Otherwise it adds context telling the model to pull. There is no polling.
14. **Processes:** at a job's end, any process the job recorded starting is
    stopped by its recorded ID. Never by name or port.
15. **Tests in scrappy:** when `tests` is `skipped`, spawning a test-engineer
    or running a test command is allowed only on Ryan's explicit ask.
    Otherwise it is logged as a routing miss, not denied.

## Context the model gets

16. On each prompt, `prompt.submit` adds one short line of hidden context:
    the mode, the jobs in flight with owner and state, and what each is
    waiting on. Example: `mode normal · #31 pr_open waiting on CI · assistant
    #34 working`.
17. When a guard denies or sends back, the reason is the context. Rules are
    never repeated in prose.

## The machine is data

- The lifecycle (states, transitions labelled by events, guards on edges) and
  the modes (policy records, and each state's status per mode) live in one
  JSON definition file: `~/.claude/session/machine.json`, with a per-repo
  override at `.claude/session.json`. The mod reads it, and reloads it when it
  changes.
- **A small web app built on zen's graph primitives edits that file:** add or
  remove states, connect them with an event label, attach guards, and set each
  state's status per mode. It's the first real consumer of zen's graph API, and
  building it is how those primitives get finalized.
- The mod validates the file on load: every edge names known states, every
  guard is a known guard, every mode sets every policy field. An invalid file
  is refused, and the last good one stays active with the error shown in the
  pane.

## Pane

18. **The head** shows the session state (`talking`, `thinking`, `delegated`)
    and the mode, with a control to switch mode.
18a. **A graph view** draws the machine from the definition (kit SVG, since the
     desktop pane draws SVG but can't host web components). States the current
     mode skips are dim; each job in flight sits as a token on its current
     state; active states are highlighted.
19. **Each job in flight** is one row: owner icon (coloured by state), the
    ask's first words, the state, and what it's waiting on. A running job
    shows its current tool call, as overview's agent cards do.
20. **Finished jobs** fold into a "done" section showing the last N.
21. **The terminal** gets the same layout in the kit's terminal look.

## Log and measurement

22. Every event, transition and guard decision is appended to
    `~/.claude/session-log/<yyyy-mm-dd>.jsonl` (rotated daily). Each line
    holds: time, session, job, mode, kind, from, to, owner, agentId,
    durationMs, the token usage, and the guard's decision and reason.
23. Per job, the mod derives: time to first reply, route taken, time in each
    state, tool calls by owner, tokens by owner, and whether CI passed first
    time. Routing misses are counted.
24. The mod's store keeps only a rolling summary (well under its 4 MiB cap).
    The JSONL files are the record.
25. `/session stats [mode] [days]` prints the per-mode numbers.

## Commands

- `/mode <name>`: switch mode for new jobs.
- `/feature`: mark the current ask a feature (allows a developer, and runs the
  feature workflow if one is saved).
- `/session stats`: numbers from the log.
- `/job cancel <id>`: cancel a job.

## Non-goals (for now)

- Running the feature or test workflows inside the mod: it starts them and
  tracks them; the workflow scripts live in `~/.claude/workflows/`.
- Cross-machine or shared logs.
- Classifying asks with a model. Routing uses observable signals only.

## Open questions

1. Is "more than `self_limit` tool calls → send back" the right routing
   signal, or should it count wall time in the main turn?
2. Should production deny commits to the default branch, or only warn?
3. Where do per-repo default modes live: the mod's settings, or a line in
   each repo's AGENTS.md?
4. Should jobs survive a session restart (resumed from the log), or start
   fresh?
5. The launcher's Take over and Kill go by port. Should this mod's process
   rule (14) apply to the launcher too, limiting it to processes it started?
