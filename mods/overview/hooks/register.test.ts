import type { SessionContextBreakdown } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import type { Segment } from '../types'
import { colorOf, formatTokens, layoutBar, PALETTE, toSnapshot } from './register'

const seg = (name: string, tokens: number, kind: Segment['kind'] = 'used'): Segment => ({ name, tokens, kind })

const breakdown: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 150_000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'MCP tools', tokens: 9_000, color: 'permission', isDeferred: true, kind: 'deferred' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
    { name: 'Messages', tokens: 14_000, color: 'claude', isDeferred: false, kind: 'used' },
  ],
  totalTokens: 17_000,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'auto',
  percentage: 9,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [
    { path: '/Users/me/.claude/CLAUDE.md', type: 'User', tokens: 900 },
    { path: '/repo/AGENTS.md', type: 'Project', tokens: 2_100 },
  ],
  mcpTools: [
    { name: 'mcp__a__x', serverName: 'a', tokens: 100, isLoaded: true },
    { name: 'mcp__a__y', serverName: 'a', tokens: 50, isLoaded: true },
    { name: 'mcp__b__z', serverName: 'b', tokens: 400, isLoaded: false },
  ],
  agents: [{ agentType: 'reviewer', source: 'userSettings', tokens: 120 }],
  isAutoCompactEnabled: true,
  autoCompactThreshold: 167_000,
  apiUsage: null,
}

describe('toSnapshot', () => {
  test('drops deferred rows and orders used, then free, then buffer', () => {
    expect(toSnapshot(breakdown).segments.map(s => s.name)).toEqual([
      'System prompt',
      'Messages',
      'Free space',
      'Autocompact buffer',
    ])
  })

  test('lists memory files largest first and sums loaded MCP tools per server', () => {
    const snap = toSnapshot(breakdown)
    expect(snap.memory).toEqual([
      { label: 'AGENTS.md (Project)', tokens: 2_100 },
      { label: 'CLAUDE.md (User)', tokens: 900 },
    ])
    expect(snap.mcp).toEqual([{ label: 'a', tokens: 150 }])
    expect(snap.compactAt).toBe(167_000)
  })
})

describe('layoutBar', () => {
  test('fills exactly the width', () => {
    const cells = layoutBar([seg('a', 50), seg('b', 30), seg('Free', 120, 'free')], 200, 37)
    expect(cells.reduce((n, c) => n + c, 0)).toBe(37)
  })

  test('a tiny used category still gets one cell, taken from free space', () => {
    const cells = layoutBar([seg('tiny', 10), seg('Free', 199_990, 'free')], 200_000, 40)
    expect(cells).toEqual([1, 39])
  })

  test('over the window, segments scale to their sum', () => {
    const cells = layoutBar([seg('a', 300), seg('b', 100)], 200, 40)
    expect(cells).toEqual([30, 10])
  })
})

describe('colorOf', () => {
  test('used segments take palette colors in order; free and buffer take none', () => {
    const segments = [seg('a', 1), seg('b', 1), seg('Free', 1, 'free')]
    expect(colorOf(segments, 0)).toBe(PALETTE[0])
    expect(colorOf(segments, 1)).toBe(PALETTE[1])
    expect(colorOf(segments, 2)).toBeUndefined()
  })
})

describe('formatTokens', () => {
  test('rounds to k and M', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(1_234)).toBe('1.2k')
    expect(formatTokens(84_000)).toBe('84k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
  })
})
