import type { Entry } from '@dailly/domain'
import { describe, expect, it } from 'vitest'
import { formatDay, groupByDay, titleOf } from './timeline.js'

const entry = (id: string, occurredAt: string, body = `corpo de ${id}`): Entry => ({
  id,
  body,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  labelIds: [],
  props: {},
})

describe('groupByDay', () => {
  it('groups by calendar day, newest day first', () => {
    const groups = groupByDay(
      [
        entry('b', '2026-07-24T18:00:00.000Z'),
        entry('a', '2026-07-24T09:00:00.000Z'),
        entry('anterior', '2026-07-23T09:00:00.000Z'),
      ],
      'UTC',
    )

    expect(groups.map((group) => group.day)).toEqual(['2026-07-24', '2026-07-23'])
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(['b', 'a'])
  })

  it('puts a late-evening entry on the day the person lived, not the UTC day', () => {
    // 21:00 in São Paulo is already the 25th in UTC. Grouping in the configured
    // zone is the difference between a timeline that makes sense and one that
    // splits an evening across two headings.
    const entries = [entry('noite', '2026-07-25T00:00:00.000Z')]

    expect(groupByDay(entries, 'America/Sao_Paulo')[0]?.day).toBe('2026-07-24')
    expect(groupByDay(entries, 'UTC')[0]?.day).toBe('2026-07-25')
  })

  it('keeps the order the repository gave it inside a day', () => {
    // The port promises newest first. Re-sorting here would hide a store that
    // broke that promise; preserving it lets the bug be seen.
    const groups = groupByDay(
      [entry('primeiro', '2026-07-24T10:00:00.000Z'), entry('segundo', '2026-07-24T08:00:00.000Z')],
      'UTC',
    )

    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(['primeiro', 'segundo'])
  })

  it('has nothing to group when there is nothing', () => {
    expect(groupByDay([], 'UTC')).toEqual([])
  })
})

describe('formatDay', () => {
  it('reads as a date in Portuguese', () => {
    expect(formatDay('2026-07-24')).toBe('24 de julho de 2026')
    expect(formatDay('2026-01-01')).toBe('1 de janeiro de 2026')
    expect(formatDay('2026-12-31')).toBe('31 de dezembro de 2026')
  })
})

describe('titleOf', () => {
  it('shows text, not markdown syntax', () => {
    expect(titleOf('# Hoje\n- item')).toBe('Hoje')
    expect(titleOf('- primeira coisa')).toBe('primeira coisa')
    expect(titleOf('1. numerada')).toBe('numerada')
    expect(titleOf('[] uma tarefa')).toBe('uma tarefa')
    expect(titleOf('[x] feita')).toBe('feita')
  })

  it('skips leading blank lines', () => {
    expect(titleOf('\n\n  \ntexto de verdade')).toBe('texto de verdade')
  })

  it('says something rather than nothing when there is no text', () => {
    expect(titleOf('')).toBe('sem título')
    expect(titleOf('#  ')).toBe('sem título')
  })
})
