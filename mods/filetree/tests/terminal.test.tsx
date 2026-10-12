// New in this fork (awesome-claude): render tests for the terminal in the kit's terminal design system.
import { expect, mock, test } from 'claude-code/testing'

import { TREE } from '@kit/tokens'

const ROOT = '/Users/k/proj'
const NOW = 1_800_000_000_000
const LONG = 'a-file-whose-name-runs-on-and-on-well-past-any-sidebar.config.ts'

type Dirs = Record<string, [string, 'file' | 'dir'][]>

/** A repository on macOS: `src/a.ts` modified (+3 −1), `notes.md` new, the branch one ahead of its upstream. */
function world(on: any, opts: { dirs?: Dirs; top?: string } = {}) {
  const dirs: Dirs = opts.dirs ?? {
    [ROOT]: [['src', 'dir'], ['README.md', 'file'], ['notes.md', 'file'], [LONG, 'file']],
    [`${ROOT}/src`]: [['a.ts', 'file'], ['b.ts', 'file']],
  }
  const top = opts.top ?? ROOT
  mock.env(on, { HOME: '/Users/k', TMPDIR: '/var/folders/x/T/' })
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'test-session' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  on('fs.list', (_$: any, e: any) => {
    const kids = dirs[e.path]
    if (!kids) throw new Error(`ENOENT ${e.path}`)
    return { value: kids.map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: NOW - 3 * 3_600_000, isLink: false })) }
  })
  on('fs.stat', (_$: any, e: any) => {
    const p: string = e.path
    const parent = p.slice(0, p.lastIndexOf('/')) || '/'
    const hit = dirs[p] ? 'dir' : dirs[parent]?.find(([n]) => n === p.slice(p.lastIndexOf('/') + 1))?.[1]
    if (!hit) throw new Error(`ENOENT ${p}`)
    return { value: { kind: hit, size: 1, mtimeMs: NOW - 3 * 3_600_000, isLink: false } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'uname') return ok('Darwin\n')
    if (argv[0] === 'sh') return ok('missing\n')
    if (argv[0] !== 'git') return ok('')
    const verb = argv.slice(4).find(a => !a.startsWith('-'))
    if (verb === 'rev-parse' && argv.at(-1) === 'HEAD') return ok('aaaaaaa1\n')
    if (verb === 'rev-parse') return top ? ok(`\n${top}\n`) : { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
    if (verb === 'status') return ok('## main...origin/main [ahead 1]\0 M src/a.ts\0?? notes.md\0')
    if (verb === 'diff' && argv.includes('--numstat')) return ok('3\t1\tsrc/a.ts\0')
    if (verb === 'ls-files') return ok('src/a.ts\0src/b.ts\0README.md\0notes.md\0')
    return ok('')
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, context: e.context }))
  return clock
}

const pane = (bodyColumns: number) => ({ component: 'Pane', requestId: 'filetree', props: { title: 'Files', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } }) as const

async function terminal($: any, on: any, columns = 60, opts: Parameters<typeof world>[1] = {}) {
  const clock = world(on, opts)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', ...pane(columns) })
  await clock.settle()
  return { clock, ui }
}

type Seg = { t: string; c?: string; dc?: boolean; b?: boolean; sh?: string }
type Row = { id: string; left: Seg[]; right: Seg[] }
const rowsProps = async (ui: any) => ((await ui.find({ type: 'Client', key: 'rows' })) as any).props.props as { rows: Row[]; tones: Record<string, string>; bar?: unknown }
const rowOf = async (ui: any, name: string) => (await rowsProps(ui)).rows.find(r => r.id === `${ROOT}/${name}`)!
const seg = (r: Row, t: string) => [...r.left, ...r.right].find(s => s.t === t || s.t === ` ${t}`)
const cells = (segs: Seg[]) => segs.reduce((n, s) => n + [...s.t].length, 0)

test('terminal: rows hang from TREE connectors, two cells a level, under a section header with its actions', async ($, on) => {
  const { ui, clock } = await terminal($, on)
  // The header is the kit's section: the folder's name bold, the actions on the right.
  const title = (await ui.findAll({ type: 'Text', text: 'proj' })).find((t: any) => t.props.bold)
  expect(title).toBeDefined()
  for (const key of ['up', 'cwd', 'refresh', 'hidden', 'size', 'collapse']) expect(await ui.find({ type: 'Button', key })).toBeDefined()
  let rows = (await rowsProps(ui)).rows
  expect(rows.map(r => r.left[0]?.t)).toEqual([TREE.tee, TREE.tee, TREE.tee, TREE.last])
  expect(rows.every(r => r.left[0]?.dc === true)).toBe(true)
  await ui.post({ press: `${ROOT}/src` }, { in: 'rows' })
  await clock.settle()
  rows = (await rowsProps(ui)).rows
  const tree = (name: string) => rows.find(r => r.id === `${ROOT}/${name}`)?.left[0]?.t
  expect(tree('src')).toBe(TREE.tee)
  expect(tree('src/a.ts')).toBe(TREE.pipe + TREE.tee)
  expect(tree('src/b.ts')).toBe(TREE.pipe + TREE.last)
  expect(rows.at(-1)?.left[0]?.t).toBe(TREE.last)
  expect(rows.filter(r => r.left[0]?.t === TREE.last)).toHaveLength(1)
  await ui.unmount()
})

test('terminal: git marks, lines changed and ages in the kit status colours as theme keys, quiet marks dim', async ($, on) => {
  const { ui, clock } = await terminal($, on)
  await ui.post({ press: `${ROOT}/src` }, { in: 'rows' })
  await clock.settle()
  const notes = await rowOf(ui, 'notes.md')
  expect(seg(notes, 'notes.md')?.c).toBe('success')
  expect(seg(notes, '?')?.c).toBe('success')
  const a = await rowOf(ui, 'src/a.ts')
  expect(seg(a, 'a.ts')?.c).toBe('warning')
  expect(seg(a, 'M')?.c).toBe('warning')
  expect(seg(a, '+3')?.c).toBe('success')
  expect(seg(a, '−1')?.c).toBe('error')
  const readme = await rowOf(ui, 'README.md')
  expect(seg(readme, 'README.md')?.c).toBeUndefined()
  expect(seg(readme, '3h')?.dc).toBe(true)
  // A folder's lines changed and file counts: the letter dim, the figure in its colour.
  const src = await rowOf(ui, 'src')
  expect(src.right.map(s => s.t).join('')).toBe(' +3 −1 M1')
  expect(src.right.at(-2)?.dc).toBe(true)
  expect(src.right.at(-1)?.c).toBe('warning')
  // No hex anywhere in the rows: theme keys and dim only.
  expect(JSON.stringify((await rowsProps(ui)).rows)).not.toMatch(/"c":"#/)
  // The branch line: name, ahead and upstream dim, the lines changed coloured.
  expect((await ui.findAll({ type: 'Text', text: /↑1 origin\/main/ })).length).toBeGreaterThan(0)
  expect((await ui.findAll({ type: 'Text', text: '+3' })).some((t: any) => t.props.color === 'success')).toBe(true)
  expect((await ui.findAll({ type: 'Text', text: '−1' })).some((t: any) => t.props.color === 'error')).toBe(true)
  await ui.unmount()
})

test("terminal: Claude's reads and writes shimmer in the kit's meanings, and a commit shows in the footer", async ($, on) => {
  const { ui, clock } = await terminal($, on)
  const { tones } = await rowsProps(ui)
  // Reads blue (live), writes amber, commits green, failures red: theme keys, never hex.
  expect(tones).toMatchObject({ purple: 'suggestion', orange: 'warning', green: 'success', red: 'error' })
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/README.md` } as any)
  await clock.settle()
  expect(seg(await rowOf(ui, 'README.md'), 'README.md')?.sh).toBe('purple')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' } as any)
  await clock.settle()
  const done = (await ui.findAll({ type: 'Text', text: /commit/ })).find((t: any) => /commit/.test(t.text))
  expect(done).toBeDefined()
  await ui.unmount()
})

test('terminal: an empty folder and a folder outside git say so with the kit notes', async ($, on) => {
  const { ui } = await terminal($, on, 40, { dirs: { [ROOT]: [] }, top: '' })
  expect((await ui.find({ type: 'Text', text: 'empty' }))?.props.dimColor).toBe(true)
  expect((await ui.find({ type: 'Text', text: 'no git repo · git status starts after git init' }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('terminal: every row fits the section body at 30, 40, 60 and 100 columns', async ($, on) => {
  const { ui, clock } = await terminal($, on)
  await ui.post({ press: `${ROOT}/src` }, { in: 'rows' })
  await clock.settle()
  await ui.unmount()
  for (const columns of [30, 40, 60, 100]) {
    const at = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', ...pane(columns) })
    await clock.settle()
    const { rows, bar } = await rowsProps(at)
    for (const r of rows) expect(cells(r.left) + cells(r.right) + (bar ? 1 : 0)).toBeLessThanOrEqual(columns - 2)
    // The long name is cut with an ellipsis rather than pushed past the edge.
    expect(rows.find(r => r.id === `${ROOT}/${LONG}`)?.left.at(-1)?.t.endsWith('…')).toBe(columns < 100)
    await at.unmount()
  }
})
