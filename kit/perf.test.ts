import { describe, expect, test } from 'bun:test'

import { createPerf, ms } from './perf'

describe('perf', () => {
  test('times sync and async work and counts events', async () => {
    const perf = createPerf()
    perf.time('render', () => {
      const end = Date.now() + 5
      while (Date.now() < end);
    })
    await perf.time('git', () => new Promise(r => setTimeout(r, 10)))
    perf.count('write')
    perf.count('write')
    const rows = Object.fromEntries(perf.snapshot().rows.map(r => [r.name, r]))
    expect(rows.render!.n).toBe(1)
    expect(rows.render!.lastMs).toBeGreaterThanOrEqual(4)
    expect(rows.git!.lastMs).toBeGreaterThanOrEqual(8)
    expect(rows.write!.perMin).toBe(2)
    expect(rows.write!.avgMs).toBe(0)
    // Costliest in the last minute first.
    expect(perf.snapshot().rows[0]!.name).toBe('git')
  })

  test('a throwing function is still timed', () => {
    const perf = createPerf()
    expect(() => perf.time('bad', () => { throw new Error('x') })).toThrow('x')
    expect(perf.snapshot().rows[0]!.n).toBe(1)
  })

  test('ms', () => {
    expect(ms(0.42)).toBe('0.4ms')
    expect(ms(12.3)).toBe('12ms')
    expect(ms(1_234)).toBe('1.2s')
  })
})
