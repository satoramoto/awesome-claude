import { describe, expect, test } from 'claude-code/testing'

import type { Activity } from '../types'
import { tagOf } from './desktop'
import { countTool, countTurn, editedPath } from './register'

const empty: Activity = { turns: 0, tools: {}, files: [], turnLog: [], contextLog: [] }

describe('activity', () => {
  test('counts calls and errors per tool, and each edited file once', () => {
    let a = countTool(empty, 'Edit', false, '/r/a.ts')
    a = countTool(a, 'Edit', true, '/r/a.ts')
    a = countTool(a, 'Bash', false)
    expect(a.tools).toEqual({ Edit: { n: 2, err: 1 }, Bash: { n: 1, err: 0 } })
    expect(a.files).toEqual(['/r/a.ts'])
  })

  test('only editing tools name a file', () => {
    expect(editedPath('Write', { file_path: '/r/b.ts' })).toBe('/r/b.ts')
    expect(editedPath('NotebookEdit', { notebook_path: '/r/n.ipynb' })).toBe('/r/n.ipynb')
    expect(editedPath('Read', { file_path: '/r/b.ts' })).toBeUndefined()
  })

  test('keeps the last 40 turns and counts them all', () => {
    let a = empty
    for (let i = 0; i < 45; i++) {
      a = countTurn(a, i, { input_tokens: i, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 })
    }
    expect(a.turns).toBe(45)
    expect(a.turnLog).toHaveLength(40)
    expect(a.turnLog[0]).toEqual({ ms: 5, input: 5, output: 1, cacheRead: 2, cacheWrite: 3 })
  })
})

describe('tags', () => {
  test('known categories get three letters, others their first three', () => {
    expect(tagOf('Messages')).toBe('msg')
    expect(tagOf('Something new')).toBe('som')
  })
})
