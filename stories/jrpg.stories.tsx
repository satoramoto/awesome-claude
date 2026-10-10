import type { Meta, StoryObj } from '@storybook/html'

import { money, short, tokens } from '@kit/format'

import { busy } from '../playground/fixtures/overview'
import { show } from './show'

// Three looks for the kit, drawn from the overview's sample session, to pick from.
// Plain boxes and text only: what the desktop draws.

const meta: Meta = { title: 'Looks/JRPG' }
export default meta

// The element names, as a mod gets them from $.ui.resolve(e).
const Box = 'Box'
const Text = 'Text'

const s = busy
const ctxLeft = 100 - s.snapshot.percent
const fiveHour = s.limits[0]!
const weekly = s.limits[1]!
const toolCalls = Object.values(s.activity.tools).reduce((n, t) => n + t.n, 0)
const elapsed = short(Date.now() - s.activity.startedAt)

/** A bar filled `value` of `max`, in a track; grow factors keep it exact at any width. */
const Gauge = (p: { value: number; max: number; color: string; track: string; height?: number }) => {
  const f = Math.max(0, Math.min(1, p.value / Math.max(p.max, 1))) * 1000
  const height = p.height ?? 0.45
  return (
    <Box flexDirection="row" flexGrow={1} height={height} backgroundColor={p.track} overflow="hidden">
      {f > 0 ? <Box flexGrow={f} width={0} height={height} backgroundColor={p.color} /> : null}
      {f < 1000 ? <Box flexGrow={1000 - f} width={0} /> : null}
    </Box>
  )
}

/** Green while healthy, yellow under half, red under a fifth: as HP bars do. */
const hpColor = (left: number, greens = ['#48d16f', '#f2c94c', '#eb5757']) => (left > 50 ? greens[0]! : left > 20 ? greens[1]! : greens[2]!)

const statusOf = (status: string) =>
  status === 'running' ? { tag: 'RUN', color: '#f2994a' } : status === 'completed' ? { tag: 'OK', color: '#48d16f' } : status === 'failed' ? { tag: 'KO', color: '#eb5757' } : { tag: '—', color: '#9b9b9b' }

// ---- 0. Sleek: modern JRPG status screens (Octopath, Xenoblade 3, Metaphor) ---------
// Thin gauges, hairlines, short uppercase labels, right-aligned figures, one accent
// per section, a slim rail for status. Text takes the page's own colour.

const SLEEK = {
  frame: 'rgba(128,128,128,0.28)',
  hair: 'rgba(128,128,128,0.22)',
  track: 'rgba(128,128,128,0.16)',
  hp: '#4fd1a5',
  mp: '#6aa7ff',
  gold: '#e8b64c',
  warn: '#f2a65a',
  bad: '#f06a7a',
  violet: '#a98bff',
}

const Hair = () => <Box height={0.06} backgroundColor={SLEEK.hair} marginY={0.35} />

/**
 * A thin rounded gauge: `value` of `max`. The track and the fill are each a box
 * with a `round` border in its own colour, which the desktop draws with rounded
 * corners, so a thin one comes out pill-shaped.
 */
const Thin = (p: { value: number; max: number; color: string }) => {
  const f = Math.max(0, Math.min(1, p.value / Math.max(p.max, 1))) * 1000
  return (
    <Box flexDirection="row" flexGrow={1} height={0.12} borderStyle="round" borderColor={SLEEK.track} backgroundColor={SLEEK.track} overflow="hidden">
      {f > 0 ? <Box flexGrow={f} width={0} borderStyle="round" borderColor={p.color} backgroundColor={p.color} /> : null}
      {f < 1000 ? <Box flexGrow={1000 - f} width={0} /> : null}
    </Box>
  )
}

/** LABEL ─── gauge ─── figure, on one line. */
const Meter = (p: { label: string; value: number; max: number; color: string; figure: string; sub?: string }) => (
  <Box flexDirection="row" alignItems="center" gap={1}>
    <Box width={3} flexShrink={0}>
      <Text color={p.color} bold>
        {p.label}
      </Text>
    </Box>
    <Thin value={p.value} max={p.max} color={p.color} />
    <Box minWidth={6} flexDirection="row" justifyContent="flex-end">
      <Text bold>{p.figure}</Text>
      {p.sub ? <Text dimColor>{p.sub}</Text> : null}
    </Box>
  </Box>
)

/** ◆ LABEL ··· right, a section's head. */
const Head = (p: { label: string; color: string; right?: string }) => (
  <Box flexDirection="row" justifyContent="space-between" marginTop={0.5}>
    <Text>
      <Text color={p.color}>{'◆ '}</Text>
      <Text bold dimColor>
        {p.label}
      </Text>
    </Text>
    {p.right ? <Text dimColor>{p.right}</Text> : null}
  </Box>
)

/** A row with a slim coloured rail on the left: an agent, its type, its figures. */
const Railed = (p: { color: string; name: string; type: string; figure: string; indent?: number }) => (
  <Box flexDirection="row" gap={1} marginTop={0.25} paddingLeft={p.indent ?? 0}>
    <Box width={0.3} backgroundColor={p.color} flexShrink={0} />
    <Box flexDirection="row" justifyContent="space-between" flexGrow={1} gap={1}>
      <Text wrap="truncate">
        {p.name}
        <Text dimColor>{`  ${p.type}`}</Text>
      </Text>
      <Text dimColor>{p.figure}</Text>
    </Box>
  </Box>
)

export const Sleek: StoryObj = {
  render: (_, ctx) => {
    const extra = s.agentExtra as Record<string, { tokens?: number; durationMs?: number; startedAt?: number }>
    const tools = Object.entries(s.activity.tools).sort((a, b) => b[1].n - a[1].n).slice(0, 4)
    const max = Math.max(...tools.map(([, t]) => t.n))
    return show(
      <Box flexDirection="column" borderStyle="round" borderColor={SLEEK.frame} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold>Claude</Text>
          <Text>
            <Text dimColor>{'LV '}</Text>
            <Text bold>{String(s.activity.turns)}</Text>
            <Text dimColor>{'   '}</Text>
            <Text color={SLEEK.gold} bold>{money(s.activity.cost)}</Text>
            <Text dimColor>{`   ${elapsed}`}</Text>
          </Text>
        </Box>
        <Meter label="HP" value={ctxLeft} max={100} color={ctxLeft > 20 ? SLEEK.hp : SLEEK.bad} figure={`${ctxLeft}`} sub="%" />
        <Meter label="MP" value={100 - fiveHour.percent} max={100} color={SLEEK.mp} figure={`${100 - fiveHour.percent}`} sub="%" />
        <Meter label="WK" value={100 - weekly.percent} max={100} color={weekly.percent > 75 ? SLEEK.warn : SLEEK.violet} figure={`${100 - weekly.percent}`} sub="%" />
        <Hair />
        <Head label="PARTY" color={SLEEK.warn} right={`${s.agents.filter(a => a.status === 'running').length} active`} />
        {s.agents.map(a => {
          const x = extra[a.id]
          const color = a.status === 'running' ? SLEEK.warn : a.status === 'completed' ? SLEEK.hp : a.status === 'failed' ? SLEEK.bad : SLEEK.track
          const time = x?.durationMs ? short(x.durationMs) : x?.startedAt ? short(Date.now() - x.startedAt) : ''
          const figure = [x?.tokens !== undefined ? tokens(x.tokens) : '', time].filter(Boolean).join(' · ')
          return <Railed color={color} name={a.description} type={a.type} figure={figure} indent={a.parentId ? 2 : 0} />
        })}
        <Hair />
        <Head label="SKILLS" color={SLEEK.violet} right={`${toolCalls} used`} />
        {tools.map(([name, t]) => (
          <Box flexDirection="row" alignItems="center" gap={1} marginTop={0.15}>
            <Box width={8} flexShrink={0}>
              <Text wrap="truncate">{name.split('__').pop() ?? name}</Text>
            </Box>
            <Thin value={t.n} max={max} color={SLEEK.violet} />
            <Box minWidth={6} flexDirection="row" justifyContent="flex-end">
              {t.err ? <Text color={SLEEK.bad}>{`${t.err}✕ `}</Text> : null}
              <Text bold>{String(t.n)}</Text>
            </Box>
          </Box>
        ))}
        <Hair />
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{`⎇ ${s.git.branch}`}</Text>
          <Text>
            <Text color={SLEEK.hp}>{`+${s.git.insertions}`}</Text>
            <Text color={SLEEK.bad}>{` −${s.git.deletions}`}</Text>
            <Text dimColor>{`  ${s.gh.prs.length} PR`}</Text>
          </Text>
        </Box>
      </Box>,
      ctx,
    )
  },
}

// ---- Instrument: Sleek without the game ----------------------------------------------
// Real names for things, no frame and no hairlines (space separates sections),
// colour only where it means something: the gauges and the agents' status rails.

const Gap = () => <Box height={0.6} />

/** A section's name: dim, plain, with a figure on the right. */
const Label = (p: { label: string; right?: string; rightColor?: string }) => (
  <Box flexDirection="row" justifyContent="space-between">
    <Text dimColor>{p.label}</Text>
    {p.right ? (
      <Text color={p.rightColor} dimColor={!p.rightColor}>
        {p.right}
      </Text>
    ) : null}
  </Box>
)

/** Name ─── thin gauge ─── figure. */
const Reading = (p: { label: string; value: number; max: number; color: string; figure: string; note?: string }) => (
  <Box flexDirection="row" alignItems="center" gap={1} marginTop={0.15}>
    <Box width={8} flexShrink={0}>
      <Text>{p.label}</Text>
    </Box>
    <Thin value={p.value} max={p.max} color={p.color} />
    <Box width={4} flexShrink={0} flexDirection="row" justifyContent="flex-end">
      <Text bold>{p.figure}</Text>
    </Box>
    <Box width={5} flexShrink={0}>
      <Text dimColor>{p.note ?? ''}</Text>
    </Box>
  </Box>
)

export const Instrument: StoryObj = {
  render: (_, ctx) => {
    const extra = s.agentExtra as Record<string, { tokens?: number; durationMs?: number; startedAt?: number }>
    const tools = Object.entries(s.activity.tools).sort((a, b) => b[1].n - a[1].n).slice(0, 4)
    const max = Math.max(...tools.map(([, t]) => t.n))
    const reset = (r?: string) => (r ? fxReset(r) : undefined)
    const running = s.agents.filter(a => a.status === 'running').length
    return show(
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text bold>{money(s.activity.cost)}</Text>
            <Text dimColor>{`  ·  ${elapsed}  ·  ${s.activity.turns} turns`}</Text>
          </Text>
          <Text dimColor>{`${s.activity.files.length} files`}</Text>
        </Box>
        <Gap />
        <Reading label="Context" value={s.snapshot.percent} max={100} color={s.snapshot.percent >= 80 ? SLEEK.bad : SLEEK.hp} figure={`${s.snapshot.percent}%`} note={tokens(s.snapshot.total)} />
        <Reading label="5-hour" value={fiveHour.percent} max={100} color={SLEEK.mp} figure={`${fiveHour.percent}%`} note={reset(fiveHour.resetsAt)} />
        <Reading label="Weekly" value={weekly.percent} max={100} color={weekly.percent > 75 ? SLEEK.warn : SLEEK.violet} figure={`${weekly.percent}%`} note={reset(weekly.resetsAt)} />
        <Gap />
        <Label label="Agents" right={running ? `${running} running` : undefined} rightColor={running ? SLEEK.warn : undefined} />
        {s.agents.map(a => {
          const x = extra[a.id]
          const color = a.status === 'running' ? SLEEK.warn : a.status === 'completed' ? SLEEK.hp : a.status === 'failed' ? SLEEK.bad : SLEEK.track
          const time = x?.durationMs ? short(x.durationMs) : x?.startedAt ? short(Date.now() - x.startedAt) : ''
          const figure = [x?.tokens !== undefined ? tokens(x.tokens) : '', time].filter(Boolean).join(' · ')
          return <Railed color={color} name={a.description} type={a.type} figure={figure} indent={a.parentId ? 2 : 0} />
        })}
        <Gap />
        <Label label="Tools" right={`${toolCalls} calls`} />
        {tools.map(([name, t]) => (
          <Box flexDirection="row" alignItems="center" gap={1} marginTop={0.15}>
            <Box width={8} flexShrink={0}>
              <Text wrap="truncate">{name.split('__').pop() ?? name}</Text>
            </Box>
            <Thin value={t.n} max={max} color={SLEEK.mp} />
            <Box width={4} flexShrink={0} flexDirection="row" justifyContent="flex-end">
              <Text bold>{String(t.n)}</Text>
            </Box>
            <Box width={5} flexShrink={0}>
              {t.err ? <Text color={SLEEK.bad}>{`${t.err}✕`}</Text> : <Text> </Text>}
            </Box>
          </Box>
        ))}
        <Gap />
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{s.git.branch}</Text>
          <Text>
            <Text color={SLEEK.hp}>{`+${s.git.insertions}`}</Text>
            <Text color={SLEEK.bad}>{` −${s.git.deletions}`}</Text>
            <Text dimColor>{`  ${s.gh.prs.length} PRs`}</Text>
          </Text>
        </Box>
      </Box>,
      ctx,
    )
  },
}

/** "2h18m", from a reset time. */
const fxReset = (iso: string) => {
  const m = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000))
  return m >= 1_440 ? `${Math.floor(m / 1_440)}d${Math.floor((m % 1_440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`
}

// ---- 1. Pokémon party -------------------------------------------------------------

const POKE = { panel: '#e8f4ff', panelBorder: '#5b8fd6', ink: '#203040', member: '#fff6e0', memberBorder: '#e0a84a', track: 'rgba(32,48,64,0.15)' }

const PartyMember = (p: { name: string; type: string; status: string; tokens?: number; time: string; lead?: boolean }) => {
  const st = statusOf(p.status)
  const hp = p.status === 'failed' ? 0 : p.status === 'completed' ? 100 : 62
  return (
    <Box borderStyle="round" borderColor={p.lead ? POKE.panelBorder : POKE.memberBorder} backgroundColor={p.lead ? '#ffffff' : POKE.member} paddingX={1} flexDirection="column" marginTop={0.3}>
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text color={POKE.ink} bold wrap="truncate">
          {p.name}
        </Text>
        <Box borderStyle="round" borderColor={st.color} backgroundColor={st.color} paddingX={0.5}>
          <Text color="#ffffff" bold>
            {st.tag}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={POKE.ink} dimColor>
          {p.type}
        </Text>
        <Text color="#e0a84a" bold>
          HP
        </Text>
        <Gauge value={hp} max={100} color={hpColor(hp)} track={POKE.track} />
        <Text color={POKE.ink}>{[p.tokens !== undefined ? tokens(p.tokens) : '', p.time].filter(Boolean).join(' ')}</Text>
      </Box>
    </Box>
  )
}

export const PokemonParty: StoryObj = {
  render: (_, ctx) =>
    show(
      <Box flexDirection="column" borderStyle="round" borderColor={POKE.panelBorder} backgroundColor={POKE.panel} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={POKE.ink} bold>
            ◓ SESSION
          </Text>
          <Text color={POKE.ink}>
            <Text bold>{`₽${money(s.activity.cost).slice(1)}`}</Text>
            <Text dimColor>{`  ${elapsed}`}</Text>
          </Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text color="#e0a84a" bold>
            HP
          </Text>
          <Gauge value={ctxLeft} max={100} color={hpColor(ctxLeft)} track={POKE.track} height={0.55} />
          <Text color={POKE.ink} bold>{`${ctxLeft}/100`}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text color="#5b8fd6" bold>
            PP
          </Text>
          <Gauge value={100 - fiveHour.percent} max={100} color="#5b8fd6" track={POKE.track} />
          <Text color={POKE.ink}>{`${100 - fiveHour.percent}%`}</Text>
        </Box>
        <Text color={POKE.ink} dimColor>{`Lv.${s.activity.turns}  ·  ${toolCalls} moves  ·  ${s.activity.files.length} items`}</Text>
        {s.agents.map((a, i) => {
          const x = (s.agentExtra as Record<string, { tokens?: number; durationMs?: number; startedAt?: number }>)[a.id]
          const time = x?.durationMs ? short(x.durationMs) : x?.startedAt ? short(Date.now() - x.startedAt) : ''
          return <PartyMember name={a.description} type={a.type} status={a.status} tokens={x?.tokens} time={time} lead={i === 0} />
        })}
      </Box>,
      ctx,
    ),
}

// ---- 2. Dragon Quest window --------------------------------------------------------

const DQ = { bg: '#0b0b1a', border: '#ffffff', ink: '#ffffff', dim: '#9aa3c7', track: 'rgba(255,255,255,0.15)' }

const DqWindow = (p: { title?: string; children: unknown }) => (
  <Box flexDirection="column" borderStyle="round" borderColor={DQ.border} backgroundColor={DQ.bg} paddingX={1} marginTop={0.3}>
    {p.title ? (
      <Text color={DQ.dim} bold>
        {p.title}
      </Text>
    ) : null}
    {p.children}
  </Box>
)

const DqRow = (p: { label: string; value: string; color?: string; cursor?: boolean }) => (
  <Box flexDirection="row" justifyContent="space-between">
    <Text color={DQ.ink}>
      <Text color={p.cursor ? DQ.ink : DQ.bg}>{'▶ '}</Text>
      {p.label}
    </Text>
    <Text color={p.color ?? DQ.ink} bold>
      {p.value}
    </Text>
  </Box>
)

export const DragonQuestWindow: StoryObj = {
  render: (_, ctx) =>
    show(
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1} width={0} flexDirection="column">
            <DqWindow title="CLAUDE">
              <DqRow label="HP" value={`${ctxLeft}`} color={ctxLeft <= 20 ? '#ff6b6b' : DQ.ink} />
              <DqRow label="MP" value={`${100 - fiveHour.percent}`} />
              <DqRow label="Lv" value={`${s.activity.turns}`} />
              <DqRow label="G" value={money(s.activity.cost).slice(1)} color="#ffd75e" />
            </DqWindow>
          </Box>
          <Box flexGrow={1} width={0} flexDirection="column">
            <DqWindow title="COMMAND">
              {Object.entries(s.activity.tools)
                .slice(0, 4)
                .map(([name, t], i) => (
                  <DqRow label={name.split('__').pop() ?? name} value={String(t.n)} cursor={i === 0} color={t.err ? '#ff6b6b' : DQ.ink} />
                ))}
            </DqWindow>
          </Box>
        </Box>
        <DqWindow>
          {s.agents.map(a => (
            <Text color={a.status === 'failed' ? '#ff6b6b' : DQ.ink} wrap="truncate">
              {a.status === 'running' ? `${a.description} is casting…` : a.status === 'failed' ? `${a.description} was defeated.` : `${a.description} is done!`}
            </Text>
          ))}
        </DqWindow>
        <DqWindow>
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text color={DQ.dim}>5H</Text>
            <Gauge value={fiveHour.percent} max={100} color="#ffffff" track={DQ.track} />
            <Text color={DQ.dim}>WK</Text>
            <Gauge value={weekly.percent} max={100} color={weekly.percent > 75 ? '#ffd75e' : '#ffffff'} track={DQ.track} />
          </Box>
        </DqWindow>
      </Box>,
      ctx,
    ),
}

// ---- 3. EarthBound flavours --------------------------------------------------------

const FLAVOURS = {
  plain: { bg: '#f4f1e8', border: '#2d2a32', ink: '#2d2a32', accent: '#3a6ea5' },
  mint: { bg: '#d9f5e5', border: '#1f6f50', ink: '#163b2d', accent: '#1f9e6e' },
  strawberry: { bg: '#ffe0ea', border: '#b0305c', ink: '#4a1427', accent: '#e0457b' },
  banana: { bg: '#fff4c2', border: '#a07a00', ink: '#4a3a00', accent: '#d9a400' },
  peanut: { bg: '#f1dfc8', border: '#7a4e24', ink: '#3d2610', accent: '#b5713a' },
} as const

/** Digits in little rounded boxes, like EarthBound's rolling HP meter. */
const Odometer = (p: { value: number; color: string; ink: string }) => (
  <Box flexDirection="row" gap={0.3}>
    {String(p.value)
      .padStart(3, '0')
      .split('')
      .map(d => (
        <Box borderStyle="round" borderColor={p.color} paddingX={0.4}>
          <Text color={p.ink} bold>
            {d}
          </Text>
        </Box>
      ))}
  </Box>
)

export const EarthBoundFlavours: StoryObj<{ flavour: keyof typeof FLAVOURS }> = {
  args: { flavour: 'mint' },
  argTypes: { flavour: { control: 'inline-radio', options: Object.keys(FLAVOURS) } },
  render: (args, ctx) => {
    const f = FLAVOURS[args.flavour]
    const card = (children: unknown) => (
      <Box flexDirection="column" borderStyle="round" borderColor={f.border} backgroundColor={f.bg} paddingX={1} marginTop={0.3}>
        {children}
      </Box>
    )
    return show(
      <Box flexDirection="column">
        {card(
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Box flexDirection="column">
              <Text color={f.ink} bold>
                Claude
              </Text>
              <Text color={f.ink} dimColor>{`Lv ${s.activity.turns} · ${elapsed}`}</Text>
            </Box>
            <Box flexDirection="column" alignItems="flex-end">
              <Box flexDirection="row" alignItems="center" gap={0.5}>
                <Text color={f.accent} bold>
                  HP
                </Text>
                <Odometer value={ctxLeft} color={f.border} ink={f.ink} />
              </Box>
              <Box flexDirection="row" alignItems="center" gap={0.5} marginTop={0.2}>
                <Text color={f.accent} bold>
                  PP
                </Text>
                <Odometer value={100 - fiveHour.percent} color={f.border} ink={f.ink} />
              </Box>
            </Box>
          </Box>,
        )}
        {card(
          [
            <Text color={f.ink} bold>
              Goods
            </Text>,
            ...Object.entries(s.activity.tools)
              .slice(0, 5)
              .map(([name, t]) => (
                <Box flexDirection="row" justifyContent="space-between">
                  <Text color={f.ink}>{`♦ ${name.split('__').pop() ?? name}`}</Text>
                  <Text color={t.err ? '#c0392b' : f.accent} bold>{`×${t.n}`}</Text>
                </Box>
              )),
          ],
        )}
        {card(
          [
            <Text color={f.ink} bold>
              Party
            </Text>,
            ...s.agents.map(a => {
              const st = statusOf(a.status)
              return (
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text color={f.ink} wrap="truncate">{`★ ${a.description}`}</Text>
                  <Text color={st.color} bold>
                    {st.tag}
                  </Text>
                </Box>
              )
            }),
          ],
        )}
        {card(
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={f.ink}>{`$${money(s.activity.cost).slice(1)}`}</Text>
            <Text color={f.ink}>{`${s.gh.prs.length} letters`}</Text>
            <Text color={f.ink}>{`${s.activity.files.length} items`}</Text>
          </Box>,
        )}
      </Box>,
      ctx,
    )
  },
}
