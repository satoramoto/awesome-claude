import type { Resources } from '../types'

/*
 * The session's share of the machine. One small Python script reads the
 * counters: it finds the session's Claude Code process (the nearest ancestor
 * named `claude`), its whole process tree, and for the tree and the system:
 * CPU, resident memory, disk bytes (proc_pid_rusage per process; the block
 * devices' totals) and network bytes (the interfaces'). The tree's own network
 * bytes come from `nettop`, which always takes 5 s, so it runs on its own.
 * Rates are deltas between samples. macOS only. register.tsx runs both; this
 * file holds the script and the arithmetic.
 */

export const RESOURCES_SCRIPT = String.raw`
import ctypes, json, os, re, subprocess
def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout
rows = {}
for line in sh('ps', '-A', '-o', 'pid=,ppid=,%cpu=,rss=,comm=').splitlines():
    p = line.split(None, 4)
    if len(p) == 5: rows[int(p[0])] = (int(p[1]), float(p[2]), int(p[3]), os.path.basename(p[4]))
me = os.getpid()
root = pid = os.getppid()
while pid in rows:
    if rows[pid][3] == 'claude':
        root = pid
        break
    pid = rows[pid][0]
kids = {}
for k, v in rows.items(): kids.setdefault(v[0], []).append(k)
tree, todo = [], [root]
while todo:
    p = todo.pop()
    if p == me: continue
    tree.append(p)
    todo.extend(kids.get(p, []))
lib = ctypes.CDLL('/usr/lib/libproc.dylib')
buf = (ctypes.c_uint64 * 20)()
disk = 0
for p in tree:
    # rusage_info_v2: a 16-byte uuid, then u64s; disk bytes read and written are words 18 and 19.
    if lib.proc_pid_rusage(p, 2, ctypes.byref(buf)) == 0: disk += buf[18] + buf[19]
io = sh('ioreg', '-c', 'IOBlockStorageDriver', '-r', '-k', 'Statistics', '-d', '1')
net, seen = 0, set()
for line in sh('netstat', '-ib').splitlines()[1:]:
    p = line.split()
    if len(p) >= 10 and p[2].startswith('<Link') and not p[0].startswith('lo') and p[0] not in seen:
        seen.add(p[0]); net += int(p[6]) + int(p[9])
print(json.dumps({
  'pids': tree, 'cores': os.cpu_count(),
  'cpu': sum(rows[p][1] for p in tree if p in rows), 'cpuAll': sum(v[1] for v in rows.values()),
  'mem': sum(rows[p][2] for p in tree if p in rows) * 1024, 'memAll': int(sh('sysctl', '-n', 'hw.memsize')),
  'disk': disk, 'diskAll': sum(int(x) for x in re.findall(r'"Bytes \((?:Read|Write)\)"=(\d+)', io)),
  'netAll': net,
}))
`

/** The tree's network, one nettop sample: per process, bytes in and out so far. */
export const NETTOP = ['nettop', '-P', '-L', '1', '-x', '-J', 'bytes_in,bytes_out']

/**
 * Whether to read the tree's own network bytes with nettop. Measured: about 0.015 s
 * of CPU a run (it mostly waits out its 5 s), next to the script's 0.1 s. Off, the
 * footer shows the tree's network as unknown.
 */
export const NET_PER_PROCESS = true

type Counters = {
  pids: number[]
  cores: number
  cpu: number
  cpuAll: number
  mem: number
  memAll: number
  disk: number
  diskAll: number
  netAll: number
}

let prev: { at: number; c: Counters } | null = null
let netPrev: { at: number; bytes: number } | null = null
let net: number | null = null

/** The tree's process ids from the last sample, for nettop's lines. */
export let treePids: number[] = []

/** Turns the script's output into a Resources; null on the first sample. */
export const toResources = (stdout: string, at: number): Resources | null => {
  const c = JSON.parse(stdout) as Counters
  treePids = c.pids
  const before = prev
  prev = { at, c }
  if (!before) return null
  const secs = Math.max(0.5, (at - before.at) / 1000)
  const rate = (a: number, b: number) => Math.max(0, (a - b) / secs)
  const allCores = c.cores * 100
  return {
    procs: c.pids.length,
    cpu: (c.cpu / allCores) * 100,
    cpuAll: Math.min(100, (c.cpuAll / allCores) * 100),
    mem: c.mem,
    memAll: c.memAll,
    disk: rate(c.disk, before.c.disk),
    diskAll: rate(c.diskAll, before.c.diskAll),
    net,
    netAll: rate(c.netAll, before.c.netAll),
  }
}

/** Folds one nettop sample into the tree's network rate. */
export const takeNettop = (stdout: string, at: number) => {
  const mine = new Set(treePids)
  let bytes = 0
  for (const line of stdout.split('\n')) {
    const m = /\.(\d+),(\d+),(\d+),?$/.exec(line)
    if (m && mine.has(Number(m[1]))) bytes += Number(m[2]) + Number(m[3])
  }
  if (netPrev) net = Math.max(0, (bytes - netPrev.bytes) / Math.max(0.5, (at - netPrev.at) / 1000))
  netPrev = { at, bytes }
}
