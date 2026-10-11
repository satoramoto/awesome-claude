// New in this fork (awesome-claude): render and behaviour tests for the desktop version (hooks/desktop.tsx).
import { expect, mock, test } from 'claude-code/testing'

import { C, GRAY, TRACK } from '@kit/tokens'

const ROOT = '/Users/k/proj'
const NOW = 1_800_000_000_000

type Dirs = Record<string, [string, 'file' | 'dir'][]>

/** A repository on macOS: `src/a.ts` modified (+3 −1), `notes.md` new, the branch one ahead of its upstream. */
function world(on: any, opts: { dirs?: Dirs; heads?: string[] } = {}) {
  const ran: string[][] = []
  const scrolls: unknown[] = []
  const dirs: Dirs = opts.dirs ?? {
    [ROOT]: [['src', 'dir'], ['README.md', 'file'], ['notes.md', 'file']],
    [`${ROOT}/src`]: [['a.ts', 'file'], ['b.ts', 'file']],
  }
  const heads = opts.heads ?? ['aaaaaaa1']
  mock.env(on, { HOME: '/Users/k', TMPDIR: '/var/folders/x/T/' })
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'test-session' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_$: any, e: any) => (ran.push(['toast', String(e.text)]), { value: undefined }))
  on('ui.scroll', (_$: any, e: any) => (scrolls.push(e), {}))
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
    ran.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'uname') return ok('Darwin\n')
    if (argv[0] === 'sh') return ok('missing\n')
    if (argv[0] !== 'git') return ok('')
    const verb = argv.slice(4).find(a => !a.startsWith('-'))
    if (verb === 'rev-parse' && argv.at(-1) === 'HEAD') return ok(`${(heads.length > 1 ? heads.shift() : heads[0]) ?? ''}\n`)
    if (verb === 'rev-parse') return ok(`\n${ROOT}\n`)
    if (verb === 'status') return ok('## main...origin/main [ahead 1]\0 M src/a.ts\0?? notes.md\0')
    if (verb === 'diff' && argv.includes('--numstat')) return ok('3\t1\tsrc/a.ts\0')
    if (verb === 'ls-files') return ok('src/a.ts\0src/b.ts\0README.md\0notes.md\0')
    return ok('')
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, context: e.context }))
  return { clock, ran, scrolls }
}

const pane = (bodyColumns: number) => ({ component: 'Pane', requestId: 'filetree', props: { title: 'Files', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } }) as const

async function desktop($: any, on: any, columns = 46, opts: Parameters<typeof world>[1] = {}) {
  const w = world(on, opts)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetree', surface: 'desktop', ...pane(columns) })
  await w.clock.settle()
  return { ...w, ui }
}

/** The Text that shows exactly `text`. */
const textOf = async (ui: any, text: string) => (await ui.findAll({ type: 'Text', text })).find((t: any) => t.text === text)

test('desktop: rows are drawn by the hook with Octicons, git colours and lines changed; the terminal keeps its rows Client', async ($, on) => {
  const { ui, clock } = await desktop($, on)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  // Folders and files each with their Octicon, drawn as SVG.
  const svgs = JSON.stringify(await ui.findAll({ type: 'Svg' }))
  expect(svgs).toContain('M1.75 1A1.75') // folder
  expect(svgs).toContain('M2 1.75C2') // file (README.md)
  // Each row's name is a Button keyed by its path.
  for (const name of ['src', 'README.md', 'notes.md']) expect(await ui.find({ type: 'Button', key: `${ROOT}/${name}` })).toBeDefined()
  // A new file is green and lettered ?, the root's lines changed green and red, the date in a grey.
  expect((await textOf(ui, 'notes.md'))?.props.color).toBe(C.ok)
  expect((await ui.findAll({ type: 'Text', text: '?' })).some((t: any) => t.text === '?' && t.props.color === C.ok)).toBe(true)
  expect((await textOf(ui, '+3'))?.props.color).toBe(C.ok)
  expect((await textOf(ui, '−1'))?.props.color).toBe(C.bad)
  expect((await textOf(ui, '3h'))?.props.color).toBe(GRAY.mid)
  // The branch line: its name, one ahead, the upstream.
  expect(await textOf(ui, 'main')).toBeDefined()
  expect(await textOf(ui, ' ↑1')).toBeDefined()
  expect(await textOf(ui, 'origin/main')).toBeDefined()
  // Every header action is there as a Button.
  for (const key of ['up', 'cwd', 'refresh', 'hidden', 'size', 'collapse']) expect(await ui.find({ type: 'Button', key })).toBeDefined()
  await ui.unmount()
  const term = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', ...pane(60) })
  await clock.settle()
  expect(await term.find({ type: 'Client', key: 'rows' })).toBeDefined()
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  await term.unmount()
})

test('desktop: a press selects and highlights a row, opens a folder, twice opens a file, and the footer opens the selection', async ($, on) => {
  const { ui, clock, ran } = await desktop($, on)
  await ui.press({ key: `${ROOT}/src` })
  await clock.settle()
  expect(await ui.find({ type: 'Button', key: `${ROOT}/src/a.ts` })).toBeDefined()
  // The open folder's icon, and a source file's.
  const svgs = JSON.stringify(await ui.findAll({ type: 'Svg' }))
  expect(svgs).toContain('M.513 1.513') // folder-open
  expect(svgs).toContain('M4 1.75C4') // file-code
  await ui.press({ key: `${ROOT}/src/b.ts` })
  await clock.settle()
  const row = await ui.find({ type: 'Box', key: `row-${ROOT}/src/b.ts` })
  expect(row?.props.backgroundColor).toBe(TRACK)
  expect((await textOf(ui, 'src/b.ts'))?.props.color).toBe(GRAY.mid)
  expect(ran.some(a => a[0] === 'open')).toBe(false)
  await ui.press({ key: 'open' })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${ROOT}/src/b.ts`])
  await clock.advance(1_000)
  await ui.press({ key: `${ROOT}/README.md` })
  await ui.press({ key: `${ROOT}/README.md` })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${ROOT}/README.md`])
  await ui.press({ key: 'unselect' })
  await clock.settle()
  expect(await ui.find({ key: 'open' })).toBeUndefined()
  await ui.unmount()
})

test('desktop: search filters the rows, the clear button empties it, and sizes swap in for dates', async ($, on) => {
  const { ui, clock } = await desktop($, on)
  await ui.input({ key: 'q', text: 'b.ts', kind: 'change' })
  await clock.settle()
  expect(await ui.find({ type: 'Button', key: `${ROOT}/src/b.ts` })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: `${ROOT}/README.md` })).toBeUndefined()
  await ui.press({ key: 'clear' })
  await clock.settle()
  expect(await ui.find({ type: 'Button', key: `${ROOT}/README.md` })).toBeDefined()
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  await ui.press({ key: 'size' })
  await clock.settle()
  expect(await textOf(ui, '3h')).toBeUndefined()
  expect(await textOf(ui, '1 B')).toBeDefined()
  await ui.unmount()
})

test("desktop: Claude's read and write light their rows, then fade; a commit shows in the footer", async ($, on) => {
  const { ui, clock } = await desktop($, on, 46, { heads: ['aaaaaaa1', 'bbbbbbb2'] })
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/README.md` } as any)
  await clock.settle()
  // A read: the name in blue, bold, with a blue rail, and the pane asked to show it.
  const read = await textOf(ui, 'README.md')
  expect(read?.props.color).toBe(C.blue)
  expect(read?.props.bold).toBe(true)
  expect(JSON.stringify(await ui.find({ type: 'Box', key: `row-${ROOT}/README.md` }))).toContain(`"backgroundColor":"${C.blue}"`)
  await clock.advance(3_000)
  expect((await textOf(ui, 'README.md'))?.props.color).toBeFalsy()
  expect((await textOf(ui, 'README.md'))?.props.bold).toBeFalsy()
  // A write inside a closed folder: the folder opens and the file is lit amber, bold.
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/src/a.ts`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  expect((await textOf(ui, 'a.ts'))?.props.color).toBe(C.warn)
  expect((await textOf(ui, 'a.ts'))?.props.bold).toBe(true)
  // A commit: the footer shows it with its short hash, green.
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' } as any)
  await clock.settle()
  expect(await textOf(ui, 'committed')).toBeDefined()
  expect(await textOf(ui, 'bbbbbbb')).toBeDefined()
  await ui.unmount()
})

test('desktop: the pane mounts at the sidebar widths, and an empty folder says so', async ($, on) => {
  const { ui, clock } = await desktop($, on, 28, { dirs: { [ROOT]: [] } })
  expect(await textOf(ui, 'empty')).toBeDefined()
  await ui.unmount()
  for (const columns of [46, 80]) {
    const wide = await $.ui.mount({ plugin: 'filetree', surface: 'desktop', ...pane(columns) })
    await clock.settle()
    expect(await wide.find({ type: 'Button', key: 'refresh' })).toBeDefined()
    await wide.unmount()
  }
})
