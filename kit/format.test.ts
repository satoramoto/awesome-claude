import { describe, expect, test } from 'bun:test'

import { duration, money, pct, short, tokens } from './format'

describe('format', () => {
  test('tokens', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(1_234)).toBe('1.2k')
    expect(tokens(200_000)).toBe('200k')
    expect(tokens(1_000_000)).toBe('1M')
  })

  test('durations', () => {
    expect(duration(12_000)).toBe('12s')
    expect(duration(185_000)).toBe('3m 05s')
    expect(short(47 * 60_000)).toBe('47m')
    expect(short(125 * 60_000)).toBe('2h05')
    expect(short(76 * 3_600_000)).toBe('3d4h')
  })

  test('whole, clamped percentages: the desktop takes no others', () => {
    expect(pct(1, 3)).toBe('33%')
    expect(pct(9, 4)).toBe('100%')
    expect(pct(1, 0)).toBe('100%')
  })

  test('money', () => {
    expect(money(1.5)).toBe('$1.50')
    expect(money(123.4)).toBe('$123')
  })
})
