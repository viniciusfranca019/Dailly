import { describe, expect, it } from 'vitest'
import { parse } from './index.js'
import { serialize } from './index.js'

const roundTrip = (md: string) => serialize(parse(md))

describe('serialize', () => {
  it('is idempotent on normalized source', () => {
    const md = [
      '# Daily',
      '## Morning',
      '  [] stand up',
      '  [x] coffee',
      '    - beans',
      '- details',
      '  1. first',
      '  2. second',
      'plain paragraph',
    ].join('\n')

    expect(roundTrip(md)).toBe(md)
    expect(roundTrip(roundTrip(md))).toBe(md)
  })

  it('normalizes checkbox and bullet markers', () => {
    expect(roundTrip('- [ ] a\n* [x] b')).toBe('[] a\n[x] b')
    expect(roundTrip('* a\n+ b')).toBe('- a\n- b')
  })

  it('renumbers ordered lists from 1', () => {
    expect(roundTrip('5. a\n9. b\n3) c')).toBe('1. a\n2. b\n3. c')
  })

  it('restarts numbering after a non-numbered block interrupts the run', () => {
    expect(roundTrip('1. a\n- x\n4. b')).toBe('1. a\n- x\n1. b')
  })

  it('re-indents nesting with two spaces per level', () => {
    expect(roundTrip('- a\n\t- b\n\t\t- c')).toBe('- a\n  - b\n    - c')
  })

  it('keeps every heading level', () => {
    expect(roundTrip('#### Deep')).toBe('#### Deep')
    expect(roundTrip('# Top')).toBe('# Top')
  })

  it('does not write collapsed state into the markdown', () => {
    const blocks = parse('## Section\n  - a')
    const collapsed = [{ ...blocks[0]!, collapsed: true }]
    expect(serialize(collapsed)).toBe('## Section\n  - a')
  })
})

describe('empty blocks', () => {
  it('keeps a bare marker as an empty block of that type', () => {
    const types = ['#', '####', '-', '1.', '[]'].map((md) => parse(md)[0]?.type)
    expect(types).toEqual(['heading', 'heading', 'bulletedList', 'numberedList', 'todo'])
  })

  it('round-trips bare markers', () => {
    for (const md of ['#', '####', '-', '1.', '[]']) {
      expect(roundTrip(md)).toBe(md)
    }
  })

  it('still rejects markers that are not really markers', () => {
    expect(parse('#####')[0]?.type).toBe('paragraph')
    expect(parse('---')[0]?.type).toBe('paragraph')
    expect(parse('####x')[0]?.type).toBe('paragraph')
  })
})
