import { describe, expect, it } from 'vitest'
import { NameRequiredError } from './board.js'
import {
  InvalidFocusLevelError,
  InvalidWindowError,
  TaskInOtherProgramError,
  TaskInProgramFocusError,
  isFocusLevel,
  parseNewProgram,
} from './program.js'

describe('parseNewProgram (LAB-9 C1, C2)', () => {
  it('C1: trims the fields and keeps the window', () => {
    expect(
      parseNewProgram({
        name: ' Dailly v1 ',
        objective: ' fechar a v1 ',
        windowStart: '2026-11-25',
        windowEnd: '2026-12-19',
        exitWhen: 'os cards dailly v1 em Done',
      }),
    ).toEqual({
      name: 'Dailly v1',
      objective: 'fechar a v1',
      windowStart: '2026-11-25',
      windowEnd: '2026-12-19',
      exitWhen: 'os cards dailly v1 em Done',
    })
  })

  it('only the name is required; the rest is empty or null', () => {
    expect(parseNewProgram({ name: 'Casa' })).toEqual({
      name: 'Casa',
      objective: '',
      windowStart: null,
      windowEnd: null,
      exitWhen: '',
    })
  })

  it('refuses an empty name', () => {
    expect(() => parseNewProgram({ name: '  ' })).toThrow(NameRequiredError)
  })

  it('C2: refuses a window whose end comes before its start', () => {
    expect(() => parseNewProgram({ name: 'x', windowStart: '2026-12-19', windowEnd: '2026-11-25' })).toThrow(
      new InvalidWindowError('o fim da janela vem depois do início').message,
    )
  })

  it('a one-day window is valid', () => {
    expect(parseNewProgram({ name: 'x', windowStart: '2026-11-25', windowEnd: '2026-11-25' }).windowEnd).toBe(
      '2026-11-25',
    )
  })

  it('refuses a date that is not YYYY-MM-DD or does not exist', () => {
    for (const windowStart of ['25/11/2026', '2026-02-30', 'amanhã']) {
      expect(() => parseNewProgram({ name: 'x', windowStart })).toThrow(InvalidWindowError)
    }
  })
})

describe('focus levels', () => {
  it('are P0, P1 and P2', () => {
    expect(['P0', 'P1', 'P2', 'P3', 'p0', null].map(isFocusLevel)).toEqual([true, true, true, false, false, false])
    expect(new InvalidFocusLevelError('P3').message).toBe('o foco é P0, P1 ou P2')
  })
})

describe('the refusals name the task and the program (C4, C6)', () => {
  it('C4: a task already in another program', () => {
    expect(new TaskInOtherProgramError('LAB-5', 'Dailly v1').message).toBe('LAB-5 já está no programa Dailly v1')
  })

  it('C6: a task of a program does not go into focus alone', () => {
    expect(new TaskInProgramFocusError('LAB-5', 'Dailly v1').message).toBe(
      'LAB-5 é do programa Dailly v1: ponha o programa em foco',
    )
  })
})
