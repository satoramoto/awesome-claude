import { expect, test } from 'claude-code/testing'

import { DESKTOP_REFUSED, SURFACES, experiments, galleryExperiments } from './experiments'

/*
 * Mounts every experiment's pane on every surface and records what the engine
 * made of the tree: accepted (and, for the live ones, what driving it did) or
 * refused, with the engine's reason. The run prints one `VERDICTS {json}` line;
 * mods/lab/verdicts.json is that line, kept.
 *
 * The kit validates trees and runs Client modules on a mocked frame clock; it
 * never paints, so whether an accepted SVG blurs or a SMIL animation moves is
 * for a person to look at (`/lab <id>` in the desktop app).
 */

declare const console: { log: (...args: unknown[]) => void }

const PANE = { title: 'Lab', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const VIEWPORT = { columns: 80, rows: 40, isFullscreen: true }

type Verdict = { accepted: boolean; note: string }
type Ui = any

const reasonOf = (err: unknown) => {
  const text = String((err as Error)?.message ?? err)
  const m = /refused: (.*?)(; the engine drew its own|$)/s.exec(text)
  return (m ? m[1]! : text).replace(/\s+/g, ' ').trim()
}

/** Every Text a Client's module drew, joined: what it shows. */
const shown = async (ui: Ui, inside: string) =>
  (await ui.findAll({ type: 'Text', in: inside })).map((t: any) => t.text).join(' | ')

/** The colour of the first Text a Client's module drew. */
const firstColor = async (ui: Ui, inside: string) => (await ui.find({ type: 'Text', in: inside }))?.props?.color

const SCRUB = 'the validator passes the markup whole (drawn() holds it unchanged); any scrub is the surface page\'s, paint unverified'
const ANIM = 'accepted as markup; whether it moves is paint, unverified headlessly'

/** What an accepted tree means where the kit cannot see the paint. */
const NOTES: Record<string, string> = {
  'svg-limit-ok': 'exactly 131072 characters accepted',
  'svg-not-svg': 'the validator does not parse the SVG: any string up to the cap is accepted',
  'svg-no-alt': 'an empty alt is accepted',
  'scrub-script': SCRUB,
  'scrub-onload': SCRUB,
  'scrub-href': SCRUB,
  'scrub-data-href': SCRUB,
  'scrub-foreign': SCRUB,
  'smil-interactive': ANIM,
  'smil-image': ANIM,
  'css-interactive': ANIM,
  'css-image': ANIM,
  'svg-hover': 'accepted; hover is paint, unverified headlessly',
  'svg-title': 'accepted; tooltip is paint, unverified headlessly',
  'border-unknown': 'accepted; per the docs drawn with no border and logged (the kit does not surface the log)',
  'code-bad-diff': 'accepted; per the docs drawn as plain code and logged (the kit does not surface the log)',
  'text-long': 'accepted; per the docs the first 100000 characters draw, then a note of how much is cut',
  'fractional-cells': 'fractional height and margin accepted',
}

/** What driving a live experiment did, read back through the kit. */
const PROBES: Record<string, (ui: Ui) => Promise<string>> = {
  'client-blink': async ui => {
    const a = await firstColor(ui, 'blink')
    await ui.advance(500)
    const b = await firstColor(ui, 'blink')
    await ui.advance(500)
    const c = await firstColor(ui, 'blink')
    return `dot colour ${a} -> ${b} -> ${c} at 500 ms steps`
  },
  'client-fade': async ui => {
    const a = await firstColor(ui, 'fade')
    await ui.advance(400)
    const b = await firstColor(ui, 'fade')
    return `colour ${a} -> ${b} after advance(400)`
  },
  'client-bar': async ui => {
    await ui.resize({ columns: 40, rows: 1, in: 'bar' })
    await ui.advance(1000)
    const a = await shown(ui, 'bar')
    await ui.advance(1000)
    const b = await shown(ui, 'bar')
    return `at 40 columns: 1 s "${a.replace(/ +/g, ' ')}", 2 s "${b.replace(/ +/g, ' ')}"`
  },
  'client-spinner': async ui => {
    const frames = [await shown(ui, 'spinner')]
    for (let i = 0; i < 2; i++) {
      await ui.advance(80)
      frames.push(await shown(ui, 'spinner'))
    }
    return `frames ${frames.map(f => f.split(' | ')[0]).join(' ')} at 80 ms`
  },
  'client-fps': async ui => {
    await ui.advance(1000)
    return `mocked clock, 1 s: every(1) "${(await shown(ui, 'fps1')).split(' | ')[0]}", every(16) "${(await shown(ui, 'fps16')).split(' | ')[0]}"`
  },
  'client-pointer': async ui => {
    await ui.resize({ columns: 40, rows: 6, in: 'pointer' })
    await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'pointer' })
    await ui.pointer({ type: 'move', x: 5, y: 2, in: 'pointer' })
    const moved = (await shown(ui, 'pointer')).split(' | ').pop()
    await ui.pointer({ type: 'down', x: 7, y: 3, button: 'left', in: 'pointer' })
    await ui.pointer({ type: 'move', x: 50, y: 9, button: 'left', fine: { x: 50.25, y: 9.5 }, in: 'pointer' })
    const dragged = (await shown(ui, 'pointer')).split(' | ').pop()
    return `"${moved}"; drag past the edge "${dragged}"`
  },
  'client-keys': async ui => {
    await ui.key({ key: 'a', in: 'keys' })
    await ui.key({ key: 'right', ctrl: true, in: 'keys' })
    return `"${(await shown(ui, 'keys')).split(' | ').pop()}"`
  },
  'client-post': async ui => {
    await ui.press({ key: 'ping' })
    const pressed = (await shown(ui, 'echo')).split(' | ').pop()
    await ui.post({ ping: 41 }, { in: 'echo' })
    const posted = (await shown(ui, 'echo')).split(' | ').pop()
    return `press -> "${pressed}"; post {ping:41} -> "${posted}"`
  },
  buttons: async ui => {
    const found = await ui.findAll({ type: 'Button' })
    const r = await ui.press({ key: 'primary' })
    return `${found.length} Buttons; press primary -> ${JSON.stringify(r ?? null)}`
  },
  'input-select': async ui => {
    await ui.input({ key: 'name', text: 'typed', kind: 'change' })
    await ui.input({ key: 'name', text: 'typed' })
    await ui.select({ key: 'pick', value: 'c' })
    return 'input change + submit and select reached their handlers'
  },
  'markdown-links': async ui => {
    await ui.press({ key: 'md-links', link: { href: 'https://example.com/mine' } })
    return 'link press reached onLinkPress'
  },
}

const verdicts: Record<string, Record<string, Verdict>> = {}

const judge = async ($: any, id: string, surface: string, listed: boolean): Promise<Verdict> => {
  let ui: Ui
  try {
    ui = await $.ui.mount({ plugin: 'lab', surface, component: 'Pane', props: PANE, requestId: `lab-${id}`, viewport: VIEWPORT })
  } catch (err) {
    return { accepted: false, note: reasonOf(err) }
  }
  try {
    const threw = await ui.find({ type: 'Text', text: /^draw threw: / })
    if (threw) return { accepted: false, note: `the element refused its props as built: ${threw.text.slice('draw threw: '.length)}` }
    const notes = ['accepted']
    const absent = await ui.find({ type: 'Text', text: /^absent from the / })
    if (absent) notes.push(`${absent.text}; resolve's stand-in draws an empty column Box, no alt`)
    else notes.push(NOTES[id] ?? 'paint unverified')
    const probe = PROBES[id]
    if (probe && !absent) {
      try {
        notes.push(await probe(ui))
      } catch (err) {
        notes.push(`probe failed: ${reasonOf(err)}`)
      }
    }
    if (!listed) notes.push('(not a listed surface)')
    return { accepted: true, note: notes.join('; ') }
  } finally {
    await ui.unmount()
  }
}

test('every experiment on every surface', { timeoutMs: 120_000 }, async $ => {
  for (const x of experiments) {
    verdicts[x.id] = {}
    for (const surface of SURFACES) verdicts[x.id]![surface] = await judge($, x.id, surface, x.surfaces.includes(surface))
  }
  console.log(`VERDICTS ${JSON.stringify(verdicts)}`)
  expect(Object.keys(verdicts)).toHaveLength(experiments.length)
  // The gallery's skip list is what this run found the desktop refusing.
  const refused = experiments.filter(x => !verdicts[x.id]?.desktop?.accepted).map(x => x.id)
  expect([...refused].sort()).toEqual([...DESKTOP_REFUSED].sort())
  // Plain elements every surface lists are accepted everywhere.
  for (const surface of SURFACES) expect(verdicts['text-styles']?.[surface]?.accepted).toBe(true)
})

test('the index opens on its own when a session starts', async ($, on) => {
  const opened: { id: string; title?: string }[] = []
  on('ui.open', async (_$, e) => {
    opened.push({ id: e.id, title: e.title })
    return { value: { isPlaced: true } }
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([{ id: 'lab', title: 'Lab' }])
})

test('the index lists every experiment and a row opens its pane', async ($, on) => {
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  for (const surface of SURFACES) {
    const ui: Ui = await $.ui.mount({ plugin: 'lab', surface, component: 'Pane', props: PANE, requestId: 'lab' })
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(experiments.length + 1)
    await ui.press({ key: 'open-svg-blur' })
    await ui.press({ key: 'gallery' })
    await ui.unmount()
  }
  expect(opened).toEqual(SURFACES.flatMap(() => ['lab-svg-blur', 'lab-gallery']))
})

test('the gallery draws every experiment the desktop accepts in one tree', async $ => {
  const ui: Ui = await $.ui.mount({ plugin: 'lab', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'lab-gallery', viewport: VIEWPORT })
  const headers = await ui.findAll({ type: 'Text', text: / — / })
  expect(headers.map((t: any) => t.text.split(' — ')[0])).toEqual(galleryExperiments().map(x => x.id))
  expect(galleryExperiments()).toHaveLength(experiments.length - DESKTOP_REFUSED.length)
  await ui.unmount()
})

test('a Client post comes back as props', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'lab', surface, component: 'Pane', props: PANE, requestId: 'lab-client-post' })
    await ui.press({ key: 'ping' })
    expect(await ui.find({ type: 'Text', text: `pong 1 via ${surface}`, in: 'echo' })).toBeDefined()
    await ui.unmount()
  }
})
