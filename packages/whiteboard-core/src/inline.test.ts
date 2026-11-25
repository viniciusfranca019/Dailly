import { describe, expect, it } from 'vitest'
import { parseInline, rawOffsetOf } from './inline.js'

/** The segments as `[text, marks, href?]`, which is what a test cares about. */
const shape = (raw: string) =>
  parseInline(raw).map((segment) =>
    segment.href === undefined
      ? [segment.text, [...segment.marks].sort()]
      : [segment.text, [...segment.marks].sort(), segment.href],
  )

describe('parseInline', () => {
  it('plain text is one segment with no mark', () => {
    expect(shape('just text')).toEqual([['just text', []]])
  })

  it('an empty text has no segment', () => {
    expect(parseInline('')).toEqual([])
  })

  it('LAB-5 C1: inline code drops the backticks', () => {
    expect(shape('rode `make dev` antes')).toEqual([
      ['rode ', []],
      ['make dev', ['code']],
      [' antes', []],
    ])
  })

  it('LAB-5 C2: bold drops the double stars', () => {
    expect(shape('**Jornal** é o nome novo')).toEqual([
      ['Jornal', ['bold']],
      [' é o nome novo', []],
    ])
  })

  it('LAB-5 C3: italic drops the star and a safe link keeps only its label', () => {
    expect(shape('*rascunho* e [docs](https://example.com)')).toEqual([
      ['rascunho', ['italic']],
      [' e ', []],
      ['docs', ['link'], 'https://example.com'],
    ])
  })

  it('marks nest: italic and code inside bold carry both marks', () => {
    expect(shape('**a *b* `c`**')).toEqual([
      ['a ', ['bold']],
      ['b', ['bold', 'italic']],
      [' ', ['bold']],
      ['c', ['bold', 'code']],
    ])
  })

  it('what is inside code stays as written', () => {
    expect(shape('`**x**`')).toEqual([['**x**', ['code']]])
  })

  it('mailto and http links are links too', () => {
    expect(shape('[me](mailto:a@b.c) [x](http://x.y)')).toEqual([
      ['me', ['link'], 'mailto:a@b.c'],
      [' ', []],
      ['x', ['link'], 'http://x.y'],
    ])
  })

  it('LAB-5 C6: an unpaired marker or an unsafe link stays as written', () => {
    const raw = '2 ** 3, `aberto e [x](javascript:alert(1))'
    expect(shape(raw)).toEqual([[raw, []]])
  })

  it('a marker with a space inside its edge is not a mark', () => {
    expect(shape('a * b * c and ** d **')).toEqual([['a * b * c and ** d **', []]])
  })

  it('empty markers are not marks', () => {
    expect(shape('`` and **** and []()')).toEqual([['`` and **** and []()', []]])
  })

  it('every segment knows where its text starts in the raw string', () => {
    const raw = 'x **bold** `c`'
    for (const segment of parseInline(raw)) {
      expect(raw.slice(segment.rawStart, segment.rawStart + segment.text.length)).toBe(segment.text)
    }
  })
})

describe('rawOffsetOf (the caret entering a formatted block)', () => {
  it('maps an offset in the visible text to the same character in the raw one', () => {
    // visible: "a bold c" — raw: "a **bold** `c`"
    const raw = 'a **bold** `c`'
    expect(rawOffsetOf(raw, 0)).toBe(0)
    expect(rawOffsetOf(raw, 2)).toBe(4) // before "b"
    expect(rawOffsetOf(raw, 4)).toBe(6) // inside "bold"
    expect(rawOffsetOf(raw, 7)).toBe(12) // before "c"
  })

  it('the end of the visible text is the end of the raw one', () => {
    expect(rawOffsetOf('a **bold**', 6)).toBe('a **bold**'.length)
  })

  it('plain text maps one to one', () => {
    expect(rawOffsetOf('plain', 3)).toBe(3)
  })
})
