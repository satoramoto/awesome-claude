# Terminal dashboard design study

What well-regarded terminal UIs do, pattern by pattern, and what our kit should
take from them. Written October 2026 for the terminal side of the kit (`kit/ui.tsx`,
`kit/tokens.ts`), while the kit moves to the `rules` look: a bold orange title and
icon with a dim `─` rule out to the figures, plain labels, bold values, and dim
italic units.

**How this was made.** It draws on project READMEs, official docs and, where the
docs were thin, the tools' source code. Each claim links its source. Screenshots
are linked, not copied. A few things could not be checked from a primary source;
they are marked *unverified*.

**Our constraints**, which every "For our kit" section is judged against:

- Panes sit in a sidebar 30 to 100 columns wide, usually one column of sections.
- Colours come from the engine's theme keys (`success`, `error`, `warning`,
  `suggestion`, `merged`, `claude`, `planMode`, `inverseText`, plus `dimColor`).
  That way they follow the person's Claude Code theme: dark, light, colour-blind or ANSI-only.
- We can't assume a Nerd Font.
- The desktop draws the same mods from the same code, so every terminal pattern
  needs a desktop counterpart.

## Contents

1. [Tools surveyed](#tools-surveyed)
2. [Section and panel headers, borders](#1-section-and-panel-headers-borders)
3. [Text hierarchy](#2-text-hierarchy)
4. [Colour strategy](#3-colour-strategy)
5. [Density and alignment](#4-density-and-alignment)
6. [Gauges, bars, sparklines and charts](#5-gauges-bars-sparklines-and-charts)
7. [Lists, trees, selection, focus, key hints](#6-lists-trees-selection-focus-key-hints)
8. [Empty, loading and error states](#7-empty-loading-and-error-states)
9. [Narrow widths and truncation](#8-narrow-widths-and-truncation)
10. [Glyphs and icons](#9-glyphs-and-icons)
11. [Animation and live updates](#10-animation-and-live-updates)
12. [Top 10 recommendations](#top-10-recommendations)
13. [Sources](#sources)

## Tools surveyed

| Category | Tool | Built with | Primary source | Screenshot |
| --- | --- | --- | --- | --- |
| System monitor | btop | C++, own renderer | [repo](https://github.com/aristocratos/btop), [btop_draw.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp) | [normal](https://github.com/aristocratos/btop/raw/main/Img/normal.png), [tty](https://github.com/aristocratos/btop/raw/main/Img/tty.png) |
| System monitor | htop | C, ncurses | [htop.1](https://github.com/htop-dev/htop/blob/main/htop.1.in), [Meter.c](https://github.com/htop-dev/htop/blob/main/Meter.c) | [screenshot](https://github.com/htop-dev/htop/blob/main/docs/images/screenshot.png?raw=true) |
| System monitor | bottom (`btm`) | Rust, ratatui | [styling docs](https://bottom.pages.dev/nightly/configuration/config-file/styling/), [args.rs](https://github.com/ClementTsang/bottom/blob/main/src/options/args.rs) | [demo](https://github.com/ClementTsang/bottom/raw/main/demos/demo.gif) |
| System monitor | glances | Python, curses | [glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py), [docs](https://glances.readthedocs.io/en/latest/cmds.html) | [summary](https://github.com/nicolargo/glances/raw/develop/docs/_static/glances-summary.png) |
| Git | lazygit | Go, gocui | [Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md), [views.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/views.go) | [screenshot](https://user-images.githubusercontent.com/8456633/174470852-339b5011-5800-4bb9-a628-ff230aa8cd4e.png) |
| Git | gitui | Rust, ratatui | [style.rs](https://github.com/gitui-org/gitui/blob/master/src/ui/style.rs), [THEMES.md](https://github.com/gitui-org/gitui/blob/master/THEMES.md) | [demo](https://github.com/gitui-org/gitui/raw/master/demo.gif), [light](https://github.com/gitui-org/gitui/raw/master/assets/light-theme.png) |
| Git | tig | C, ncurses | [tigrc(5)](https://jonas.github.io/tig/doc/tigrc.5.html), [tigrc](https://github.com/jonas/tig/blob/master/tigrc) | none in README |
| GitHub | gh-dash | Go, Bubble Tea | [theme docs](https://www.gh-dash.dev/configuration/theme/), [prrow.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/prrow/prrow.go) | [overview](https://github.com/dlvhdr/gh-dash/raw/main/docs/src/assets/overview.gif) |
| Kubernetes | k9s | Go, tview | [README](https://github.com/derailed/k9s/blob/master/README.md), [skins](https://k9scli.io/topics/skins/) | [pods](https://github.com/derailed/k9s/raw/master/assets/screen_po.png) |
| Files | yazi | Rust, ratatui | [config](https://yazi-rs.github.io/docs/configuration/yazi/), [FAQ](https://yazi-rs.github.io/docs/faq/) | [video](https://github.com/sxyazi/yazi/assets/17523360/92ff23fa-0cd5-4f04-b387-894c12265cc7) |
| Files | ranger | Python, curses | [rc.conf](https://raw.githubusercontent.com/ranger/ranger/master/ranger/config/rc.conf), [default.py](https://raw.githubusercontent.com/ranger/ranger/master/ranger/colorschemes/default.py) | [screenshot](https://raw.githubusercontent.com/ranger/ranger-assets/master/screenshots/screenshot.png) |
| Charm | lipgloss, bubbles, glow, gum, huh, Crush | Go, Bubble Tea | [lipgloss](https://github.com/charmbracelet/lipgloss), [bubbles](https://github.com/charmbracelet/bubbles) | [list](https://stuff.charm.sh/bubbles-examples/list.gif), [Crush](https://github.com/user-attachments/assets/58280caf-851b-470a-b6f7-d5c4ea8a1968) |
| Textual / Rich | Textual, Rich, Posting, Toolong, Harlequin | Python | [Textual design](https://textual.textualize.io/guide/design/), [design.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/design.py), [Rich](https://rich.readthedocs.io/) | [Posting](https://github.com/user-attachments/assets/78359ab0-5e0c-4c0b-a60b-dce06b11bbf5), [Toolong](https://github.com/Textualize/toolong/assets/554369/1595e8e0-f5bf-428b-9b84-f0b5c7f506a1) |
| Framework | ratatui | Rust | [widgets on docs.rs](https://docs.rs/ratatui/latest/ratatui/widgets/), [symbols](https://github.com/ratatui/ratatui/blob/main/ratatui-core/src/symbols/bar.rs) | [gauge](https://ratatui.rs/_astro/gauge.CN0aYSvv_xRjnm.webp), [chart](https://ratatui.rs/_astro/chart.sr1l6PA1_Z2vVN9N.webp) |
| Agent TUI | Claude Code | TypeScript, Ink | [terminal config](https://code.claude.com/docs/en/terminal-config), [status line](https://code.claude.com/docs/en/statusline) | none |
| Agent TUI | Codex CLI | Rust, ratatui | [styles.md](https://github.com/openai/codex/blob/main/codex-rs/tui/styles.md) | none |
| Agent TUI | Gemini CLI, opencode, aider | Ink; Go; Python | [Gemini themes](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/themes.md), [opencode themes](https://opencode.ai/docs/themes/), [aider](https://aider.chat/docs/config/dotenv.html) | none |
| Guidelines | clig.dev, NO_COLOR, Unicode | - | [clig.dev](https://clig.dev/), [no-color.org](https://no-color.org/), [UAX #11](https://www.unicode.org/reports/tr11/) | none |

That is 25 tools and libraries across eight categories.

---

## 1. Section and panel headers, borders

### What tools do

There are three ways to mark where a section starts.

**A. A box, with the title in the top border.** This is the most common pattern
in full-screen dashboards.

- **btop** draws a rounded box per panel (`rounded_corners = true` by default,
  square in TTY mode). It sets the title into the top edge between reversed tee
  pieces, with a superscript panel number in the highlight colour:
  `╭─┐¹cpu┌────`. The cpu box also carries a centred clock in its top edge, and
  bottom edges carry buttons with `┘…└` ([btop_draw.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp),
  [README](https://github.com/aristocratos/btop)).
- **lazygit** gives every panel a full border, `rounded` by default (also
  single, double, bold, hidden). The title is in the top edge, prefixed by its
  jump key, `[1]`, and several views in one panel become tabs in that title
  ([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md),
  [views.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/views.go)).
- **k9s** puts the resource and its count in the table's top border,
  `Pods(all)[12]`, and shows an active filter there too as `</filter>`
  ([table_helper.go](https://github.com/derailed/k9s/blob/master/internal/ui/table_helper.go)).
- **ratatui** `Block` titles go top or bottom, aligned left, centre or right,
  several to an edge: `┌Left1─Left2───Center─────────Right┐`
  ([Block](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Block.html)).
- **Textual** (`border_title`, `border_subtitle`, cut with an ellipsis) and
  **Rich** (`Panel`, rounded by default, title centred) work the same way
  ([Textual widgets](https://textual.textualize.io/guide/widgets/),
  [panel.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/panel.py)).

**B. A rule or band, with no box.**

- **Rich `Rule`** is a `─` line with the title set into it, padded a space each
  side. The title is cut with an ellipsis, or dropped when nothing fits
  ([rule.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/rule.py)).
- **glances** has no boxes. A `─` separator sits under the top bar, the sidebars
  are kept apart by a 2-column gap rather than a line, and plugin titles are bold
  ([glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py)).
- **tig** marks each view with a full-width title bar in reverse colour, bold
  when focused and plain when not (`title-focus`, `title-blur`) ([tigrc](https://github.com/jonas/tig/blob/master/tigrc)).
- **htop** has a reverse-video column-header row over the process table, and
  meters above it with no frame (from [screenshots](https://github.com/htop-dev/htop/blob/main/docs/images/screenshot.png?raw=true)).
- **ranger** defaults to `draw_borders none` ([rc.conf](https://raw.githubusercontent.com/ranger/ranger/master/ranger/config/rc.conf)).

**C. Tabs.** **gh-dash** sections are tabs reading "Title (count)", with a spinner
in place of the count while they load ([tabs.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/tabs/tabs.go)).

Focus is often shown on the border. lazygit's active border is green and bold
(cyan while searching). gitui draws unfocused blocks and titles in DarkGray. Textual
inputs swap `$border-blurred` for `$border` on focus
([style.rs](https://github.com/gitui-org/gitui/blob/master/src/ui/style.rs),
[\_input.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/widgets/_input.py)).
Claude Code colours each kind of border by its job: `permission` for dialogs,
`promptBorder` for the input, and `planMode`/`autoAccept` for modes
([terminal config](https://code.claude.com/docs/en/terminal-config)).

```
A: box, title in the border (btop, lazygit)     B: rule (Rich Rule, our "rules")
╭─┐¹cpu┌──────────────────── 2000ms ─╮           ▾ ◔ Limits ─────────── 42 %
│ cpu  ━━━━━━━━━━━━╸─────────   42% │             session ━━━━━━╸──────  42 %
╰───────────────────────────────────╯             weekly  ━━━━━━━━━━━━╸  81 %
```

### For our kit

- **Already:** borderless sections whose figures sit on the header row. We have
  four header looks behind `setTermLook`: `plain`, `band` (tig-style), `rule`
  (Rich-style) and `leader`. The one box we allow is blast-radius's hold.
- **Adopt:**
  - The `rules` header. At 30 to 100 columns a box costs 2 columns and 2 rows
    per section, which is 7% of a 30-column pane. A rule gets the same structure
    for one row and no columns. It matches Rich's `Rule`, the closest primary
    model for a single-column stack.
  - Rich's degradation order. When the row is short, the rule shrinks to
    nothing before the title is cut, and the title is cut with `…` before it is
    dropped. Ours already does this ("the rule takes only the room left").
  - Counts in the header, as k9s and gh-dash put them in the title:
    `Issues ── 12`. This is `summary`'s job already.
- **Avoid:**
  - Full boxes per section. A sidebar isn't a grid of panels, and boxes nested
    inside Claude Code's own chrome read as clutter.
  - Superscript panel numbers (btop). Their only job is a jump key, and we have
    none.
  - Reverse-video title bars (tig) as the default. They're loud in a narrow
    column and fight the prompt box below. The `panel` look is that experiment;
    keep it out of the default.

## 2. Text hierarchy

### What tools do

Nearly every tool settles on **three tiers**: default foreground for content, a
quieter tier for metadata, and bold for structure (titles, keys, the selected
row). Colour carries roles on top of that.

- **Codex CLI** writes the rule down. Primary text is the default foreground.
  Secondary text is a shared style, mostly dim. Key hints are bold keys with
  plain descriptions, and footer actions are separated by `·`
  ([styles.md](https://github.com/openai/codex/blob/main/codex-rs/tui/styles.md)).
- **Claude Code**'s theme tokens follow the same steps: `text`, then `inactive`
  ("hints, timestamps, and disabled items"), then `subtle` (fainter still, also
  faint borders) ([terminal config](https://code.claude.com/docs/en/terminal-config)).
- **Textual** has `$text-muted` (60% alpha) and `$text-disabled` (38%). Headings
  step from `$primary` bold down to `foreground-muted`
  ([design.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/design.py)).
- **gh-dash** has five text roles: primary, secondary, faint, inverted, and
  warning/success. Repo names, ages, comment counts and draft markers are faint
  ([theme](https://www.gh-dash.dev/configuration/theme/),
  [prrow.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/prrow/prrow.go)).
- **btop** draws titles bold in `title` and shortcut letters bold in `hi_fg`;
  inactive items use `inactive_fg`.
- **htop**'s monochrome scheme ranks CPU segments by weight alone: normal, then
  bold, then dim ([htop.1](https://github.com/htop-dev/htop/blob/main/htop.1.in)).
- **glances** marks the sort column with bold and underline, and has a
  `--disable-bold` switch
  ([glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py)).
- **Help footers** use weight and lightness, not hue:
  - bubbles' help draws keys a step brighter than their descriptions
    ([help.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/help/help.go));
  - Textual's Footer draws keys bold in `$accent`
    ([\_footer.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/widgets/_footer.py)).

**Italic is rare.** bottom's styles allow only colour, background and bold
([styling](https://bottom.pages.dev/nightly/configuration/config-file/styling/)).
gitui uses bold and underline only. lazygit's allowed attributes leave italic
out (bold, dim, reverse, underline, strikethrough) ([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md)).
Rich's `NO_COLOR` keeps bold, italic and underline
([console docs](https://rich.readthedocs.io/en/latest/console.html)), so
attributes are the hierarchy that survives with no colour.

**Case.** None of the tools uppercases labels by default. Uppercase shows up in
column headers (htop's `PID USER PRI`, k9s's `NAME READY STATUS`).

```
three tiers in one row (gh-dash, Codex)
 ◉ Fix the flaky login test   #412   satoramoto/app   3d
 └ bold/default ────────────┘ └ faint ──────────────────┘
```

### For our kit

- **Already:** five text roles (`title`, `label`, `value`, `secondary`, `meta`) in
  `TERM_LOOKS`. Uppercase is kept to captions.
- **Adopt:**
  - The `rules` roles: plain labels, bold values, dim meta. They line up with
    Codex's and gh-dash's tiers.
  - Bold for the current row and focused key hints, as Textual and Codex do.
- **Avoid:**
  - Letting italic carry meaning on its own. Units are dim *and* italic, so
    they still recede where italic doesn't render (some fonts and older
    terminals). Never make a role italic-only.
  - Bold on everything that's a value. In a dense list (issues, files) bold
    values would make every row shout. Keep bold values to readings and
    summaries, and keep list rows on default weight with dim notes, as gh-dash
    does.

## 3. Colour strategy

### What tools do

**Use the terminal's own 16 colours for meaning, and its default foreground for
text.** This is the clearest shared rule.

- **Codex CLI**: "Avoid ANSI black & white as foreground… the default terminal
  theme color will do a better job". It uses green for success, red for errors,
  magenta for the brand, and no unchecked custom foregrounds
  ([styles.md](https://github.com/openai/codex/blob/main/codex-rs/tui/styles.md)).
- **gitui**: every default is an ANSI name, and the README says it works on
  light and dark terminals unchanged ([style.rs](https://github.com/gitui-org/gitui/blob/master/src/ui/style.rs),
  [README](https://github.com/gitui-org/gitui/blob/master/README.md)).
- **tig**: 8-colour defaults on the terminal's own background ([tigrc](https://github.com/jonas/tig/blob/master/tigrc)).
- **ranger**: 8 colours plus BRIGHT ([default.py](https://raw.githubusercontent.com/ranger/ranger/master/ranger/colorschemes/default.py)).
- **glances** keeps the ANSI palette for its alert roles (OK green, CAREFUL
  blue, WARNING magenta, CRITICAL red) and calls `use_default_colors()`. It uses
  fixed 256-cube colours only for filled badges, because themes such as
  Catppuccin redefine ANSI red as pink and white-on-red drops to about 2:1
  ([glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py)).

**Ship explicit ANSI and light themes.**

- Claude Code ships `dark`, `light`, `dark-daltonized`, `light-daltonized`,
  `dark-ansi` and `light-ansi`, plus auto from the terminal background
  ([terminal config](https://code.claude.com/docs/en/terminal-config)).
- Gemini CLI ships `ANSI` and `ANSI Light` ([themes](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/themes.md)).
- opencode's `system` theme uses ANSI 0 to 15 and `none` for text and
  background ([themes](https://opencode.ai/docs/themes/)).
- Textual has `ansi-dark` and `ansi-light`; otherwise it avoids the 16 ANSI
  colours on purpose ([theme.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/theme.py),
  [FAQ](https://textual.textualize.io/FAQ/)).
- htop has "Light Terminal" and "Black on White" schemes
  ([ColorsPanel.c](https://github.com/htop-dev/htop/blob/main/ColorsPanel.c)).
- bottom has light variants of each built-in theme.
- glances has `--theme-white`.
- k9s has `ui.invert`.
- lazygit has `colorScheme: auto|dark|light`.

**Truecolor is opt-in or degraded.**

- btop prefers truecolor and converts to 256 colours (`-l`) or a 16-colour TTY
  theme ([README](https://github.com/aristocratos/btop)).
- lipgloss/colorprofile downsamples TrueColor → ANSI256 → ANSI → Ascii. It
  detects truecolor from `COLORTERM`, and from the TERM names kitty, ghostty and
  wezterm ([colorprofile](https://raw.githubusercontent.com/charmbracelet/colorprofile/main/env.go)).
- ratatui warns that `Rgb` is unpredictable on terminals without truecolor
  ([Color](https://docs.rs/ratatui/latest/ratatui/style/enum.Color.html)).
- Terminal.app gained truecolor only in macOS 26, and ssh and sudo drop
  `COLORTERM` ([termstandard/colors](https://github.com/termstandard/colors)).

**Accent vs status.** Tools that have an accent keep it off status colours:

- btop's `hi_fg` for keys;
- Textual's `$accent` for footer keys;
- Codex's magenta brand;
- lazygit's green active border, separate from the diff green.

gh-dash fixes its PR state colours (open `#42A0FA`, closed `#C38080`, merged
`#A371F7`), which is the hex-everywhere approach. aider's fixed hex defaults
need `--light-mode` switches to stay readable ([aider](https://aider.chat/docs/config/dotenv.html)).

**Light-terminal traps.**

- Solarized maps its body greys onto the *bright* ANSI slots (base03 is bright
  black, base01 bright green…), so "bright black" for dim text can vanish and
  bright colours become greys ([Solarized](https://ethanschoonover.com/solarized/)).
- Faint (SGR 2) support varies by terminal (*unverified*; sources conflict on
  Terminal.app). Codex still uses dim as one of three levels when there's no
  truecolor ([shimmer.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/shimmer.rs)).

**NO_COLOR.**

- htop honours it fully ([CommandLine.c](https://github.com/htop-dev/htop/blob/main/CommandLine.c)).
- Rich and lipgloss drop colour but keep attributes.
- clig.dev asks for it, along with `TERM=dumb` and non-TTY output, and warns
  "if everything is colored, the color means nothing" ([clig.dev](https://clig.dev/#output)).

### For our kit

- **Already:** status colours draw as engine theme keys (`success`, `error`,
  `warning`, `suggestion`, `merged`), so they follow dark, light, daltonized and
  ANSI themes. Greys draw as `dimColor`, never as a grey hex. This is the Codex
  and glances approach, and it's right.
- **Adopt:**
  - **Close the hex gap.** `INK`/slate, `RAMP`, cyan and orchid still draw as
    hex on the terminal (`termInk` passes them through), so a gauge's fill is a
    fixed `#8c9bb5` on a light-ansi theme. Quantity should be the default
    foreground (or `text`) on the terminal, with ramps as default/dim
    alternation or as theme keys. That is how btop's TTY mode and glances
    degrade.
  - **One structure accent, not a status.** `claude` (orange) for section
    titles in `rules` is exactly the btop `title`, Textual `$accent` or Codex
    magenta pattern. Keep it only on titles and icons in headers, never on a
    figure, or it starts to read as "warning".
  - **Test in `light-ansi` and `dark-ansi`.** Add those Claude Code themes to
    the Storybook theme toolbar if they aren't there, so a hex that slipped
    through shows up.
- **Avoid:**
  - Any foreground hex on the terminal, including RAMP shades.
  - Bright ANSI variants for meaning (the Solarized trap).
  - Background fills behind text. Glances shows how a theme's red can wreck
    white-on-red contrast; `band` takes that risk.
  - Colour as the only cue. Claude Code's screen-reader mode has "no
    color-only cues" ([accessibility](https://code.claude.com/docs/en/accessibility)),
    and each of our statuses already pairs a glyph with its colour.

## 4. Density and alignment

### What tools do

- **Fixed columns, figures right-aligned.**
  - gh-dash columns take `width`, `grow` (one column fills the rest), `hidden`
    and `align: left|right|center` ([layout](https://www.gh-dash.dev/configuration/layout/options/)).
  - Its diff stats are `+N` green and `-N` red, each padded to `%7s` so the
    column lines up ([prrow.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/prrow/prrow.go)).
  - Rich tables justify per column, and Textual's DataTable right-aligns
    numbers per cell ([tables](https://rich.readthedocs.io/en/latest/tables.html),
    [DataTable](https://textual.textualize.io/widgets/data_table/)).
- **Compact units, one largest part.**
  - gh-dash ages are `3d`, `2mo`, `now`, from the largest unit alone
    ([utils.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/utils/utils.go)).
  - tig has `relative-compact` dates (`2m`) and author initials at narrow
    widths ([tigrc(5)](https://jonas.github.io/tig/doc/tigrc.5.html)).
  - htop uses IEC units (powers of 1024).
- **Units next to the figure, values inside bars.**
  - htop right-aligns its meter text *inside* the bar (`CPU[|||||    45.2%]`)
    and cuts it at a space when it's too long ([Meter.c](https://github.com/htop-dev/htop/blob/main/Meter.c)).
  - ratatui's BarChart draws the value inside the bar and the label under it
    ([BarChart](https://docs.rs/ratatui/latest/ratatui/widgets/struct.BarChart.html)).
  - k9s legends read `used(cur m/ max m)` with bold values ([pulse.go](https://github.com/derailed/k9s/blob/master/internal/view/pulse.go)).
- **Right-side metadata in lists.** yazi's `linemode` and ranger put size or
  mtime on the right edge of each file row ([yazi config](https://yazi-rs.github.io/docs/configuration/yazi/)).
- **Density is a virtue.** clig.dev: "Increase information density—with ASCII
  art!" ([clig.dev](https://clig.dev/)).

```
label 10  | gauge (rest)              | fig 5 | unit 6     ← our reading grid
context     ━━━━━━━━━━━━━━━━╸─────────    64    k tok
cost        ━━━━━╸────────────────────  1.20    $
```

### For our kit

- **Already:** the reading grid (label 10, gauge, figure 5 right-aligned, unit
  6) is the htop and k9s pattern with stricter alignment. `ago()` and `short()`
  give the gh-dash single-unit ages, and `bytes()` the IEC units.
- **Adopt:**
  - **Signed diff figures as a pair** (`+12 −3` in `success`/`error`, padded to
    a shared width), for filetree and blast-radius. Today each mod would
    hand-roll it.
  - **A `grow` column in list rows.** `item` has text-gives-way-first already;
    let a caller mark which right-cluster part grows or hides first (see 8).
- **Avoid:**
  - Values inside bars (htop). Our gauges are thin lines, and the figure column
    keeps every value at the same x across rows, which inside-bar text can't.
  - Long dates. Ages stay relative and compact.

## 5. Gauges, bars, sparklines and charts

### What tools do

| Technique | Glyphs | Resolution per cell | Used by |
| --- | --- | --- | --- |
| Heavy line on light rail | `━` `╸` `╺` on `─` | half cell | Rich `ProgressBar` ([progress_bar.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/progress_bar.py)), ratatui `LineGauge` ([LineGauge](https://docs.rs/ratatui/latest/ratatui/widgets/struct.LineGauge.html)) |
| Horizontal eighths | `▏▎▍▌▋▊▉█` | 1/8 cell | ratatui `Gauge::use_unicode` ([Gauge](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Gauge.html)) |
| Half block, blended | `▌` filled, `░` empty | half cell + colour blend | bubbles `progress` ([progress.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/progress/progress.go)) |
| Pipes in brackets | `[|||||   45%]` | whole cell | htop, glances quicklook, bottom battery (`pipe`) |
| Per-cell gradient squares | `■` | whole cell, colour by position | btop meters ([btop_draw.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp)) |
| Vertical eighths (sparkline, bars) | `▁▂▃▄▅▆▇█` | 1/8 row | ratatui `Sparkline` and `BarChart` ([bar.rs](https://github.com/ratatui/ratatui/blob/main/ratatui-core/src/symbols/bar.rs)), Textual `Sparkline` ([docs](https://textual.textualize.io/widgets/sparkline/)) |
| Braille line graph | `⡀⣀⣠…⣿` | 2×4 dots | btop (default), htop Graph meter, bottom (default) ([args.rs](https://github.com/ClementTsang/bottom/blob/main/src/options/args.rs)) |
| Quadrants / shades | `▖▄▟▌▙█`, `░▒█` | 2×2, or 3 levels | btop `block` and `tty` graph symbols |
| Sextant / octant | Legacy Computing U+1FB00 | 2×3, 2×4 | ratatui markers; font-dependent ([Marker](https://docs.rs/ratatui/latest/ratatui/symbols/enum.Marker.html)) |

Other notes:

- **Fallbacks.**
  - btop needs Braille only for braille graphs, and switches to `tty` shades in
    16-colour mode ([README](https://github.com/aristocratos/btop)).
  - htop has ASCII sets for Graph and LED, and in monochrome draws its bar
    segments as different characters (`|#*@$%&.`) instead of colours
    ([Meter.c](https://github.com/htop-dev/htop/blob/main/Meter.c)).
  - Rich falls back to `-`.
- **Colour by level.**
  - btop paints a three-stop gradient per metric (`cpu_start/mid/end`).
  - glances colours by thresholds (default 50/70/90, CPU 65/75/85)
    ([glances.conf](https://github.com/nicolargo/glances/blob/develop/conf/glances.conf)).
- **Indeterminate progress.** Rich pulses a cosine blend along the bar
  (`total=None`), and Codex shimmers its "Working" label
  ([shimmer.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/shimmer.rs)).
- **Legends.** ratatui's Chart hides its legend when it would cover more than
  25% of the chart ([Chart](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Chart.html)).
- **Font coverage.** WezTerm draws box drawing, block elements, Braille and
  Legacy Computing itself rather than from the font
  ([custom_block_glyphs](https://wezterm.org/config/lua/config/custom_block_glyphs.html)).
  Elsewhere Legacy Computing is font-dependent.
- **Claude Code's own docs** build status-line bars as 10 cells of `█`/`░` or
  `▓`/`░`, whole cells only ([status line](https://code.claude.com/docs/en/statusline)).

```
our gauge (Rich-style)     ━━━━━━━━━━━━━╸──────────────  52 %
our bar (ratatui eighths)  ███████████████▍░░░░░░░░░░░░  58 %
braille sparkline (btop)   ⣀⣀⣠⣤⣴⣶⣾⣿⣷⣶⣤⣀⡀⢀⣀⣤⣶⣿⣿⣷⣦⣄⣀⣀
eighths sparkline (ratatui)▁▁▂▃▅▆▇█▇▆▃▁ ▁▃▆██▇▅▃▂▁▁
```

### For our kit

- **Already:** `gauge` is the Rich/LineGauge heavy line to the half cell,
  `bar` the ratatui eighths on a `░` track, and `columns` the vertical eighths.
  `levelColor` is glances' threshold colouring (75/90). These are the
  best-supported glyph sets: Box Drawing and Block Elements, in every
  monospace font.
- **Adopt:**
  - **A Braille sparkline (`k.spark`)** for time series: activity, tokens per
    minute, CPU of a dev server. Braille gives 2×4 dots per cell, so 4 points of
    history per 2 cells and 4 levels per row. That is the default of btop,
    bottom and htop's Graph meter. Keep `columns` (eighths) as the fallback and
    for counts. On the desktop it's an SVG polyline.
  - **Monochrome-safe bars.** A bar with two or more parts relies on colour to
    tell them apart. Under `NO_COLOR` or a monochrome theme, alternate fill
    glyphs (`█` / `▓`) between adjacent parts, as htop does in monochrome.
- **Avoid:**
  - Sextants, octants and other Legacy Computing glyphs. They're missing from
    many fonts outside WezTerm.
  - Per-cell gradients (btop). They need truecolor and invent hues with no
    meaning, which breaks the one-colour-one-meaning rule.
  - Animated or blended progress (bubbles, Rich pulse) for figures that are
    only measured.

## 6. Lists, trees, selection, focus, key hints

### What tools do

**Selection is a row background or reverse video, and dims when its pane loses
focus.**

- lazygit: `selectedLineBgColor` (blue), with a grey
  `inactiveViewSelectedLineBgColor` in unfocused panels ([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md)).
- tig: the cursor row is `white green bold`, losing bold in `cursor-blur`
  ([tigrc](https://github.com/jonas/tig/blob/master/tigrc)).
- Textual: the cursor is `$primary` with bold text, dropping to 30% alpha with
  no bold when blurred ([design.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/design.py)).
- ranger: `reverse` ([default.py](https://raw.githubusercontent.com/ranger/ranger/master/ranger/colorschemes/default.py)).
- gitui: a blue background with a white foreground ([style.rs](https://github.com/gitui-org/gitui/blob/master/src/ui/style.rs)).
- gh-dash: a grey row background plus a `→` selection glyph
  ([constants.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/constants/constants.go)).
- Claude Code: pickers use the `suggestion` token for the selection, and
  screen-reader mode turns menus into numbered lists ([accessibility](https://code.claude.com/docs/en/accessibility)).

**Trees.**

- htop (`F5`) and btop (`proc_tree`) collapse branches; bottom uses `-` / `+` /
  Space ([bottom usage](https://bottom.pages.dev/nightly/usage/widgets/process/)).
- lipgloss ships `Default` and `Rounded` tree enumerators (`├──`, `╰──`)
  ([lipgloss](https://github.com/charmbracelet/lipgloss)).
- tig has `line-graphics ascii|default|utf-8`.

**Miller columns** (ranger `column_ratios 1,3,4`, yazi `ratio`) need width we
don't have.

**Sort indicators.** bottom puts `▲`/`▼` on the sorted column
([sortable.rs](https://github.com/ClementTsang/bottom/blob/main/src/canvas/components/data_table/sortable.rs)),
k9s `↑`/`↓`, and glances underlines and bolds it.

**Key hints** take three forms.

1. **A footer line**, which is the most common.
   - htop's F-key bar (`F1Help F2Setup …`).
   - bubbles `help`: short help on one line joined by ` • `, cut with `…` at the
     width, and `?` for the full help in columns
     ([help.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/help/help.go)).
   - Textual's `Footer`: the focused widget's bindings, keys bold in `$accent`
     ([Footer](https://textual.textualize.io/widgets/footer/)).
   - Codex: `·` between actions, and `(0s • esc to interrupt)` after a status
     ([status_indicator_widget.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/status_indicator_widget.rs)).
   - Claude Code: `esc to interrupt` and `? for shortcuts` ([status line](https://code.claude.com/docs/en/statusline)).
   - lazygit's `showBottomLine`.
2. **In the border.** btop draws a bold `hi_fg` shortcut letter inside the word,
   `t`erminate, `k`ill, as clickable buttons in the box edge.
3. **A legend grid.** k9s shows up to 6 rows of `<key> description`, with
   numbered favourites `<0> all` ([menu.go](https://github.com/derailed/k9s/blob/master/internal/ui/menu.go)).

**Breadcrumbs.** k9s shows `frame.crumbs` along the bottom, toggled with ctrl-g.

```
selected row (tig/Textual)        footer hints (bubbles, Codex)
  ◐ build   running      12s      ↑↓ move · ⏎ open · r rerun · ? more…
▌ ✕ test    failed        3s  ←── bold, `suggestion` gutter mark
  ✓ lint    done          1s
```

### For our kit

- **Already:**
  - `item` is the list row (`[tree][lead] text note … right`). `tree`
    connectors are two cells, `├─`, `└─`, and `│ `.
  - `actions` take a `hotkey` (`1: Proceed`) and `autoFocus` for the safe
    choice. `section` folds on its arrow.
- **Adopt:**
  - **A focus/selection style for `item`.** When a pane takes the keyboard (the
    filetree, issues list or launcher), the current row needs a mark. In a
    sidebar a full-row background is risky: it fights the theme, and
    `inverseText` on an unknown background is glances' contrast trap. Use a
    `suggestion`-coloured `▌` gutter mark plus bold text, which is Claude
    Code's own selection colour. Drop the bold and dim the mark when the pane
    loses focus (tig, Textual, lazygit). On the desktop, use the tile's
    selected tint (`TILE_SELECTED`).
  - **A key-hint footer, `k.hints`.** One dim line, `key description` pairs
    with keys plain and descriptions dim, separated by ` · `. It drops pairs
    from the end and ends in `…` when short (bubbles). It shows only when the
    pane has focus. On the desktop it's a caption row, or nothing if the
    actions are buttons.
- **Avoid:**
  - Hints inside words (btop's `t`erminate). They don't survive truncation,
    and a cut label loses its key.
  - Hints that a custom status line hides. Claude Code's own hints compete for
    the same rows, so keep ours inside the pane.
  - Multi-row legend grids (k9s). They're far too costly in 30 columns. Put
    the long form behind `?`.

## 7. Empty, loading and error states

### What tools do

**Loading.**

- gh-dash puts a spinner where the count goes in a tab, and a spinner plus a
  message in the table body ([table.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/table/table.go)).
- Textual's `widget.loading = True` swaps the widget for pulsing dots
  ([LoadingIndicator](https://textual.textualize.io/widgets/loading_indicator/)).
- Rich `console.status` is a spinner line ([status.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/status.py)).
- lazygit's spinner is `●∙∙ ∙●∙ ∙∙● ∙●∙` at 180 ms ([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md)).
- clig.dev: print something within 100 ms ([clig.dev](https://clig.dev/#robustness-guidelines)).

**Empty.**

- gh-dash has an `EmptyState` string in the table.
- Claude Code's task list starts collapsed and does nothing when empty
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- clig.dev gives no guidance on empty states.

**Errors.**

- k9s flashes a bottom line that clears after 6 s, prefixed by an emoji per
  level (😎 😗 😡) unless `noIcons` is set ([flash.go](https://github.com/derailed/k9s/blob/master/internal/ui/flash.go)).
- Textual `notify` toasts have information, warning and error severities and
  time out after 5 s ([Toast](https://textual.textualize.io/widgets/toast/)).
- An invalid Textual input gets an `$error` border.
- clig.dev: rewrite errors for humans, put the important part last, and group
  repeats.

**Too small.**

- btop draws a centred "Terminal size too small" screen. It gives the current
  and needed width and height, each green when big enough and red when not
  ([btop.cpp](https://github.com/aristocratos/btop/blob/main/src/btop.cpp)).
- lazygit says "Not enough space to render panels"
  ([english.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/i18n/english.go)).
- glances doesn't draw a popup that won't fit
  ([glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py)).

```
loading, in place (gh-dash)       error, inline (ours)           empty (ours)
▾ ⇡ Pull requests ──── ⠹          ▾ ⇡ Pull requests ── ✕         ▾ ⇡ Pull requests ── 0
  ◌ loading…                        ✕ gh: not logged in —          no open pull requests
                                      run gh auth login
```

### For our kit

- **Already:** `note(key, text, 'empty' | 'loading' | 'error')`. Empty and
  loading are dim, error is a red `✕` with the message plain, and
  `{ lines: 2 }` gives a longer reason. This is gh-dash's in-place approach
  without the toast.
- **Adopt:**
  - **Loading in the header's figure slot.** While a section's data is first
    loading, its `summary` shows the pending glyph `◌` (or the spinner, see 10)
    where the count will go, as gh-dash tabs do. A folded section still shows
    it's loading.
  - **Errors say what to do.** Following clig.dev, the second line of an error
    `note` names the fix (`run gh auth login`). Make this the convention in
    `mod-authoring`.
  - **Keep last-good data on refresh errors.** Show the stale figures plus a
    dim `↻ 2m ago` or amber `▲` in the header rather than replacing the body
    with an error. That's how btop and k9s keep panels during a failed poll.
- **Avoid:**
  - Toasts and flash lines that clear themselves (k9s, Textual). In a sidebar
    they shift the layout, and a person who looks away misses them.
  - Emoji level markers (k9s): two cells, and widths that vary by terminal.
  - Empty sections with no line under them. A section with nothing to show
    says so in one dim line, or doesn't render.

## 8. Narrow widths and truncation

### What tools do

**Drop the least important column first.**

- glances recomputes the process table to "drop low-priority columns to keep
  Command readable", and steps its header down through `_HEADER_DEGRADE_STEPS`
  ([glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py)).
- gh-dash lets each column be `hidden` or `grow` ([layout](https://www.gh-dash.dev/configuration/layout/options/)).
- k9s hides `W` columns unless wide mode is on (ctrl-w).
- bottom hides the time axis and table gaps when small, and always hides the
  CPU column ([CHANGELOG](https://github.com/ClementTsang/bottom/blob/main/CHANGELOG.md)).
- ratatui's chart legend hides at 25%.

**Switch layout.**

- lazygit's `portraitMode` stacks the panels when narrow and tall
  ([window_arrangement_helper.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/controllers/helpers/window_arrangement_helper.go)).
- bottom's basic mode (`-b`) drops the graphs ([basic mode](https://bottom.pages.dev/nightly/usage/basic-mode/)).
- yazi hides a pane at ratio 0.

**Truncate with an ellipsis, at the end, by default.**

- Rich table columns default to `overflow="ellipsis"`.
- Rich `Rule` and Textual border titles cut with `…`.
- bubbles help stops and appends `…`.
- gh-dash uses `…`.
- tig's `truncation-delimiter` is `~` or `⋯`.
- Ink offers `truncate-end`, `truncate-start` and `truncate-middle`
  ([Ink](https://github.com/vadimdemedes/ink)).
- htop cuts meter text at a space, then keeps the start.

**Bound multi-line detail.** Codex caps a detail block at 3 lines plus an
ellipsis, and moves a status hint onto its own line when it doesn't fit
([status_indicator_widget.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/status_indicator_widget.rs)).

```
100 cols  ◉ Fix flaky login test  needs review   #412  satoramoto/app  ✓ ci  3d
 60 cols  ◉ Fix flaky login test  needs re…            #412  ✓  3d
 40 cols  ◉ Fix flaky login…            #412  ✓  3d
 30 cols  ◉ Fix fl…          #412  ✓
```

### For our kit

- **Already:**
  - `item` gives way in a set order: the text first, down to 6 cells with
    `…`, then the right cluster from its end.
  - `reading` narrows its label and then drops the gauge.
  - `summary` cuts with `…` and never clips a figure without one.
  - `legend` reflows into 1 or 2 columns.
  - `keepRight` protects header controls.
  - We're closer to glances' degrade steps than most tools are.
- **Adopt:**
  - **Declared priorities for the right cluster.** Today the cluster is cut from
    its end, so the caller has to order it by importance and loses visual
    order. Let each part carry a `drop` rank, as gh-dash's `hidden` and
    glances' low-priority columns do, so the age can go before the CI mark
    whatever their order.
  - **`truncate-middle` for paths and branch names.** The end of a file path is
    the part that matters (`src/…/view.tsx`). Ink supports it, so expose it
    through `item` and `prop` when the text is a path.
  - **A floor below 30 columns.** If a pane is narrower than the kit's minimum,
    draw the section headers and their figures only. That's our bottom basic
    mode: headers still truncate cleanly and bodies are skipped, rather than
    every reading collapsing to `…`.
- **Avoid:**
  - Wrapping on the terminal. A line never wraps; only `note` breaks onto a
    second line, between words.
  - A "too small" screen (btop). A sidebar can't ask for more room; degrade
    instead.

## 9. Glyphs and icons

### What tools do

**Nerd Font icons are opt-in nearly everywhere.**

- lazygit: `nerdFontsVersion` defaults to `""` ("do not show icons") and takes
  "2" or "3" ([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md)).
- eza: `--icons` is off unless asked for ([eza.1](https://github.com/eza-community/eza/blob/main/man/eza.1.md)).
- k9s: has `ui.noIcons` because "not all terminal support these chars"
  ([README](https://github.com/derailed/k9s/blob/master/README.md)).
- yazi: icons are on by default with Nerd Fonts "recommended". Its FAQ ships a
  no-Nerd-Font preset that blanks them, because without the font they show as
  boxes ([FAQ](https://yazi-rs.github.io/docs/faq/)).
- gh-dash: hard-codes Nerd Font glyphs with no fallback
  ([constants.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/constants/constants.go)),
  the counter-example.
- Nerd Fonts live in the Private Use Area, and code points have moved between
  versions (Material Design `f001–f847` became `f500–fd46`)
  ([glyph sets](https://github.com/ryanoasis/nerd-fonts/wiki/Glyph-Sets-and-Code-Points)).
  kitty has `narrow_symbols` because PUA icons followed by a space spread to two
  cells ([kitty.conf](https://sw.kovidgoyal.net/kitty/conf/)).

**Plain Unicode needs no special font.**

- btop needs nothing beyond Braille, Geometric Shapes, and Box Drawing/Block
  Elements ([README](https://github.com/aristocratos/btop)).
- htop builds with Unicode on, and has ASCII fallbacks.
- Rich and tig have ASCII modes (`line-graphics ascii`).

**Emoji are a width hazard.**

- UAX #11 makes `Emoji_Presentation` characters wide (2 cells) and
  ambiguous-width characters narrow by default ([UAX #11](https://www.unicode.org/reports/tr11/)).
- From [emoji-data.txt](https://www.unicode.org/Public/UCD/latest/ucd/emoji/emoji-data.txt):
  - always 2 cells: `⚡ ✅ ❌ ⏳ ⭐`;
  - 1 cell, but 2 after VS16 (U+FE0F) where the terminal honours it:
    `⚠ ✔ ✖ ℹ ▶`;
  - not emoji, so safe: `✓ ●`.
- Terminals disagree on VS16 and ZWJ widths. One ZWJ sequence measures 2, 4, 5
  or 6 cells depending on the terminal
  ([Mitchell Hashimoto](https://mitchellh.com/writing/grapheme-clusters-in-terminals),
  [ucs-detect](https://ucs-detect.readthedocs.io/)).
- An xterm/mutt bug thread from December 2025 recommends never emitting U+FE0F
  ([debian-x](https://lists.debian.org/debian-x/2025/12/msg00252.html)).
- Despite this, k9s uses emoji in its flash line and bubbles ships emoji
  spinners (Globe, Moon, Monkey), both of which can break alignment.

### For our kit

- **Already:** this is our strongest area.
  - Every glyph is one cell, with none from the Emoji property, and the
    `bun -e` check is in the skill.
  - `k.icon` falls back from desktop SVG and Octicons to a plain glyph, and to
    `•` for anything unknown.
  - No Nerd Font is assumed.
  - It is stricter than lazygit's or yazi's defaults.
- **Adopt:**
  - **Turn the emoji check into a test.** Make it a kit test that walks
    `GLYPH`, `STATUS`, `TERM_GLYPH`, `METER`, `FOLD` and `TREE`, so a new glyph
    can't regress.
  - **Remove the U+FE0E dependency from the terminal.** `fold()` relies on U+FE0E
    to keep `▶` from turning into an emoji on the desktop. The terminal already
    uses `▾ ▸`. Keep `▶`/`▼` (with VS15) on the desktop only, and never send a
    variation selector to the terminal, as the xterm thread recommends.
  - **Check ambiguous-width glyphs.** Some of ours (`◐ ◌ ◉ ○ ◆ ■ ▲ ★`-class
    geometric shapes) are East Asian Ambiguous. They're narrow by default, but
    two cells in CJK-configured terminals. Note that in the skill, and keep the
    count small (*not tested here*).
- **Avoid:**
  - Nerd Font glyphs, even opt-in, unless a setting turns them on. We'd need
    a full second icon set to stay consistent.
  - Emoji anywhere on the terminal: statuses, flashes, spinners.
  - Legacy Computing glyphs (see 5).

## 10. Animation and live updates

### What tools do

**Data refreshes at 1 to 2 s.**

| Tool | Default refresh | Minimum | Source |
| --- | --- | --- | --- |
| btop | 2 s | recommends 2 s or more for good graph samples | [README](https://github.com/aristocratos/btop) |
| htop | 1.5 s | 0.1 s | [Settings.h](https://github.com/htop-dev/htop/blob/main/Settings.h) |
| bottom | 1 s | 250 ms | [args.rs](https://github.com/ClementTsang/bottom/blob/main/src/options/args.rs) |
| glances | 2 s | idle plugins 5× slower | [glances.conf](https://github.com/nicolargo/glances/blob/develop/conf/glances.conf) |
| k9s | 2 s | 2 s | [README](https://github.com/derailed/k9s/blob/master/README.md) |
| lazygit | 10 s, fetch every 60 s | none | [Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md) |
| Claude Code status line | 300 ms debounce | `refreshInterval` 1 s | [status line](https://code.claude.com/docs/en/statusline) |

**Spinners run at 80 to 180 ms per frame.**

- cli-spinners `dots` (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) runs at 80 ms, `line` at 130 ms
  ([spinners.json](https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json)).
- bubbles `Dot` (`⣾⣽⣻⢿⡿⣟⣯⣷`) runs at 10 fps and `Points` at 7 fps
  ([spinner.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/spinner/spinner.go)).
- lazygit's dots run at 180 ms.
- Rich status refreshes 12.5 times a second.

**Frame budget.**

- Ink caps at 30 fps and can redraw only the lines that changed
  ([Ink](https://github.com/vadimdemedes/ink)).
- Rich Live refreshes 4 times a second by default.
- Codex redraws about every 32 ms while animating and about every 1 s
  otherwise.
- Synchronized output (DEC mode 2026) wraps a frame so it doesn't tear
  ([spec](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036)).
  Claude Code has `CLAUDE_CODE_FORCE_SYNC_OUTPUT` and a no-flicker fullscreen
  mode ([terminal config](https://code.claude.com/docs/en/terminal-config)).

**Reduced motion.**

- Claude Code's `prefersReducedMotion` "reduce[s] or turn[s] off spinner,
  shimmer, and flash animations" ([settings](https://code.claude.com/docs/en/settings-reference)).
- Screen-reader mode renders spinners as static text.
- clig.dev: no animation when the output isn't a TTY.

**Elapsed time.** Codex shows `59s`, `1m 01s`, `1h 01m 01s` next to the
spinner.

### For our kit

- **Already:**
  - Mods poll on `$.clock.every` (issues 5 s, launcher and overview their own
    ticks), and render only while the pane is shown.
  - `running` is a static `◐`; `perf` times the jobs.
- **Adopt:**
  - **One shared, optional spinner** for `running` only: `◐◓◑◒` (one cell,
    non-emoji, the same family as our glyph) at about 120 ms. Show it only
    while the pane is visible, and fall back to static `◐` when the engine
    reports reduced motion or the screen-reader mode. *Check first that the
    engine exposes `prefersReducedMotion`; if it doesn't, that's a contract
    request.*
  - **Elapsed time on running items** in the Codex format (`12s`, `1m 05s`),
    from `duration()`, updated on the pane's tick rather than per frame.
  - **Write down tick floors in `mod-authoring`:**
    - local data (files, git) no faster than 1 s;
    - network (gh) no faster than 5 to 10 s;
    - idle panes slower, following glances' 5× rule for idle plugins.
- **Avoid:**
  - Shimmer and gradient sweeps (Codex, Claude Code's own spinner). They need
    truecolor and compete with Claude Code's own spinner directly above the
    prompt.
  - Animated progress bars (bubbles' spring). A measured value should jump,
    not ease.
  - Animating anything that isn't live. Only `running` and first-load
    `pending` move.

---

## Top 10 recommendations

Ordered by how much each improves the terminal for the effort.
Effort: S is under a day, M is one to three days, L is more.

| # | Change | Why (who does it) | Effort | Kit primitive |
| --- | --- | --- | --- | --- |
| 1 | **No hex foregrounds on the terminal.** Draw quantity (`INK`/slate) as the default foreground, and `RAMP`/cyan/orchid as default/dim alternation or theme keys. Add `light-ansi` and `dark-ansi` to Storybook's theme toolbar. | Codex, gitui, glances, opencode `system`: ANSI-following colours stay readable on every theme | M | `termInk`, `THEME_KEY` in `kit/tokens.ts`; `gauge`, `bar`, `columns`, `swatch` |
| 2 | **Ship `rules` as the default header**, with Rich `Rule`'s degradation order: the rule shrinks first, then the title is cut with `…`. Keep `claude` orange for titles and header icons only. | Rich `Rule`, glances separators; btop `title` and Textual `$accent` as a single structure accent | S | `section` (`TERM_LOOKS.rules`) |
| 3 | **A selection style for `item`:** a `suggestion` `▌` gutter mark plus bold, dimmed when the pane isn't focused; `TILE_SELECTED` on the desktop. | lazygit, tig, Textual: the cursor row dims on blur; `suggestion` is Claude Code's selection token | M | `item`, `tile` |
| 4 | **A key-hint footer `k.hints`:** plain keys, dim descriptions, ` · ` separators, dropped from the end with `…`, shown only with focus. | bubbles `help`, Textual `Footer`, Codex, htop | M | new `hints` in `kit/ui.tsx`; uses `action` hotkeys |
| 5 | **Loading in the figure slot:** a section's `summary` shows `◌` (or the spinner) until first data, and keeps last-good figures with a dim age or amber `▲` on refresh errors. | gh-dash tabs; btop and k9s keep panels through failed polls | S | `section`, `summary`, `note` |
| 6 | **Declared drop priority for list-row parts,** plus `truncate-middle` for paths. | glances low-priority columns, gh-dash `hidden`/`grow`, Ink `truncate-middle` | M | `item`, `prop` |
| 7 | **A Braille sparkline `k.spark`** (2×4 dots per cell) for time series, with `columns` eighths as the fallback, and an SVG polyline on the desktop. | btop, bottom and htop Graph meter defaults; ratatui `Marker::Braille` | M | new `spark`, beside `columns`/`axis` |
| 8 | **One shared spinner for `running`** (`◐◓◑◒`, about 120 ms), static under reduced motion, plus Codex-style elapsed time; tick floors written into `mod-authoring`. | cli-spinners, bubbles, Claude Code `prefersReducedMotion`, Codex elapsed time | M (contract request if the engine lacks a reduced-motion read) | `status`, `item`; `GLYPH.running` |
| 9 | **A glyph-safety test** that walks every terminal glyph table for the Emoji property and variation selectors. Remove U+FE0E from anything the terminal draws. | UAX #11, emoji-data, the VS16 width disagreements; k9s and bubbles emoji as counter-examples | S | `GLYPH`, `STATUS`, `TERM_GLYPH`, `METER`, `FOLD`, `TREE`, `fold()` |
| 10 | **Monochrome-safe and narrow-floor fallbacks:** multi-part bars alternate `█`/`▓` under no colour, and below 30 columns sections draw headers and figures only. Italic never carries a role alone. | htop monochrome glyphs, bottom basic mode, Rich `NO_COLOR` keeping attributes | S | `bar`, `section`, `kit()` width, `TERM_LOOKS` roles |

**Deliberately not recommended:**

- boxes per section;
- reverse-video title bands as the default;
- Nerd Font icons;
- per-cell colour gradients;
- toasts and flash lines;
- in-word hotkeys;
- Legacy Computing glyphs;
- a "terminal too small" screen.

Each one is explained in its section above.

## Sources

Primary sources used, by tool (each is also linked where it's cited):

- **btop:** [README](https://github.com/aristocratos/btop), [btop_draw.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp), [btop.cpp](https://github.com/aristocratos/btop/blob/main/src/btop.cpp), [nord.theme](https://github.com/aristocratos/btop/blob/main/themes/nord.theme)
- **htop:** [htop.1](https://github.com/htop-dev/htop/blob/main/htop.1.in), [Meter.c](https://github.com/htop-dev/htop/blob/main/Meter.c), [CommandLine.c](https://github.com/htop-dev/htop/blob/main/CommandLine.c), [ColorsPanel.c](https://github.com/htop-dev/htop/blob/main/ColorsPanel.c), [MainPanel.c](https://github.com/htop-dev/htop/blob/main/MainPanel.c), [Settings.h](https://github.com/htop-dev/htop/blob/main/Settings.h)
- **bottom:** [args.rs](https://github.com/ClementTsang/bottom/blob/main/src/options/args.rs), [styling](https://bottom.pages.dev/nightly/configuration/config-file/styling/), [basic mode](https://bottom.pages.dev/nightly/usage/basic-mode/), [process widget](https://bottom.pages.dev/nightly/usage/widgets/process/), [CHANGELOG](https://github.com/ClementTsang/bottom/blob/main/CHANGELOG.md)
- **glances:** [glances_curses.py](https://github.com/nicolargo/glances/blob/develop/glances/outputs/glances_curses.py), [glances.conf](https://github.com/nicolargo/glances/blob/develop/conf/glances.conf), [cmds](https://glances.readthedocs.io/en/latest/cmds.html), [quicklook](https://glances.readthedocs.io/en/latest/aoa/quicklook.html)
- **lazygit:** [Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md), [views.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/views.go), [window_arrangement_helper.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/controllers/helpers/window_arrangement_helper.go), [english.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/i18n/english.go)
- **gitui:** [style.rs](https://github.com/gitui-org/gitui/blob/master/src/ui/style.rs), [THEMES.md](https://github.com/gitui-org/gitui/blob/master/THEMES.md), [README](https://github.com/gitui-org/gitui/blob/master/README.md)
- **tig:** [tigrc(5)](https://jonas.github.io/tig/doc/tigrc.5.html), [tigrc](https://github.com/jonas/tig/blob/master/tigrc)
- **gh-dash:** [theme](https://www.gh-dash.dev/configuration/theme/), [layout](https://www.gh-dash.dev/configuration/layout/options/), [prrow.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/prrow/prrow.go), [constants.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/constants/constants.go), [table.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/table/table.go), [tabs.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/tui/components/tabs/tabs.go), [utils.go](https://github.com/dlvhdr/gh-dash/blob/main/internal/utils/utils.go)
- **k9s:** [README](https://github.com/derailed/k9s/blob/master/README.md), [skins](https://k9scli.io/topics/skins/), [menu.go](https://github.com/derailed/k9s/blob/master/internal/ui/menu.go), [table_helper.go](https://github.com/derailed/k9s/blob/master/internal/ui/table_helper.go), [pulse.go](https://github.com/derailed/k9s/blob/master/internal/view/pulse.go), [flash.go](https://github.com/derailed/k9s/blob/master/internal/ui/flash.go)
- **yazi:** [configuration](https://yazi-rs.github.io/docs/configuration/yazi/), [FAQ](https://yazi-rs.github.io/docs/faq/), [flavors](https://yazi-rs.github.io/docs/flavors/overview/)
- **ranger:** [rc.conf](https://raw.githubusercontent.com/ranger/ranger/master/ranger/config/rc.conf), [default.py](https://raw.githubusercontent.com/ranger/ranger/master/ranger/colorschemes/default.py)
- **Charm:** [lipgloss](https://github.com/charmbracelet/lipgloss), [colorprofile](https://github.com/charmbracelet/colorprofile), [bubbles help.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/help/help.go), [progress.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/progress/progress.go), [spinner.go](https://raw.githubusercontent.com/charmbracelet/bubbles/master/spinner/spinner.go), [glow](https://github.com/charmbracelet/glow), [gum](https://github.com/charmbracelet/gum), [huh](https://github.com/charmbracelet/huh)
- **Textual and Rich:** [design guide](https://textual.textualize.io/guide/design/), [design.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/design.py), [theme.py](https://raw.githubusercontent.com/Textualize/textual/main/src/textual/theme.py), [FAQ](https://textual.textualize.io/FAQ/), [Footer](https://textual.textualize.io/widgets/footer/), [Sparkline](https://textual.textualize.io/widgets/sparkline/), [Rich console](https://rich.readthedocs.io/en/latest/console.html), [rule.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/rule.py), [progress_bar.py](https://raw.githubusercontent.com/Textualize/rich/master/rich/progress_bar.py), [Posting](https://github.com/darrenburns/posting), [Toolong](https://github.com/Textualize/toolong), [Harlequin](https://github.com/tconbeer/harlequin)
- **ratatui:** [Block](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Block.html), [BorderType](https://docs.rs/ratatui/latest/ratatui/widgets/enum.BorderType.html), [Marker](https://docs.rs/ratatui/latest/ratatui/symbols/enum.Marker.html), [Gauge](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Gauge.html), [LineGauge](https://docs.rs/ratatui/latest/ratatui/widgets/struct.LineGauge.html), [Sparkline](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Sparkline.html), [Chart](https://docs.rs/ratatui/latest/ratatui/widgets/struct.Chart.html), [bar.rs](https://github.com/ratatui/ratatui/blob/main/ratatui-core/src/symbols/bar.rs)
- **Agent TUIs:** [Claude Code terminal config](https://code.claude.com/docs/en/terminal-config), [status line](https://code.claude.com/docs/en/statusline), [interactive mode](https://code.claude.com/docs/en/interactive-mode), [accessibility](https://code.claude.com/docs/en/accessibility), [settings](https://code.claude.com/docs/en/settings-reference), [Ink](https://github.com/vadimdemedes/ink), [Codex styles.md](https://github.com/openai/codex/blob/main/codex-rs/tui/styles.md), [Gemini CLI themes](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/themes.md), [opencode themes](https://opencode.ai/docs/themes/), [aider](https://aider.chat/docs/config/dotenv.html)
- **Norms:** [clig.dev](https://clig.dev/), [NO_COLOR](https://no-color.org/), [FORCE_COLOR](https://force-color.org/), [termstandard/colors](https://github.com/termstandard/colors), [Solarized](https://ethanschoonover.com/solarized/), [UAX #11](https://www.unicode.org/reports/tr11/), [emoji-data.txt](https://www.unicode.org/Public/UCD/latest/ucd/emoji/emoji-data.txt), [grapheme clusters in terminals](https://mitchellh.com/writing/grapheme-clusters-in-terminals), [Nerd Fonts](https://www.nerdfonts.com/), [cli-spinners](https://github.com/sindresorhus/cli-spinners), [synchronized output](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036), [WezTerm custom block glyphs](https://wezterm.org/config/lua/config/custom_block_glyphs.html)

**Unverified:**

- how widely terminals support faint (SGR 2);
- which glyphs Claude Code uses for its spinner and transcript (`⏺`, `⎿`);
- whether btop, bottom and Textual honour NO_COLOR;
- gh-dash's refetch interval;
- whether our ambiguous-width glyphs measure two cells in CJK locales.
