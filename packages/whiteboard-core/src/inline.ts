/**
 * Inline markdown of a block's text: code, bold, italic and links.
 *
 * The model keeps the raw text, markers and all, because that is what goes back
 * to markdown; this only reads it. The result is flat — a list of segments, each
 * with the marks it sits under — so a renderer wraps each one without walking a
 * tree, and an offset in what is shown maps back to the raw text by arithmetic.
 *
 * A marker without its pair, or with a space on its inner edge (`2 ** 3`), is
 * plain text. A link only counts when its target is `http:`, `https:` or
 * `mailto:`: anything else (`javascript:`) is left as written.
 */

export type InlineMark = 'code' | 'bold' | 'italic' | 'link'

export interface InlineSegment {
  /** The text shown, without markers. */
  readonly text: string
  /** Where `text` starts in the raw string. */
  readonly rawStart: number
  readonly marks: ReadonlySet<InlineMark>
  /** The link target, when `marks` has `link`. */
  readonly href?: string
}

const SAFE_HREF = /^(https?:|mailto:)/i

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char)

export function parseInline(raw: string): InlineSegment[] {
  const segments: InlineSegment[] = []

  const push = (text: string, rawStart: number, marks: ReadonlySet<InlineMark>, href?: string) => {
    if (text === '') return
    const last = segments.at(-1)
    // Plain characters arrive one run at a time; glue a run to the previous one
    // when nothing about it differs, so plain text stays a single segment.
    if (last && last.href === href && sameMarks(last.marks, marks) && last.rawStart + last.text.length === rawStart) {
      segments[segments.length - 1] = { ...last, text: last.text + text }
      return
    }
    segments.push(href === undefined ? { text, rawStart, marks } : { text, rawStart, marks, href })
  }

  const scan = (from: number, to: number, marks: ReadonlySet<InlineMark>, href?: string): void => {
    let plainStart = from
    let i = from
    const flush = (until: number) => push(raw.slice(plainStart, until), plainStart, marks, href)

    while (i < to) {
      const matched = matchAt(raw, i, to, marks)
      if (!matched) {
        i += 1
        continue
      }
      flush(i)
      const inner = new Set(marks).add(matched.mark)
      if (matched.mark === 'code') push(raw.slice(matched.innerStart, matched.innerEnd), matched.innerStart, inner, href)
      else scan(matched.innerStart, matched.innerEnd, inner, matched.href ?? href)
      i = matched.end
      plainStart = i
    }
    flush(to)
  }

  scan(0, raw.length, new Set())
  return segments
}

interface Match {
  readonly mark: InlineMark
  readonly innerStart: number
  readonly innerEnd: number
  /** Just past the closing marker. */
  readonly end: number
  readonly href?: string
}

/** The construct that opens at `i`, closed before `to`, or nothing. */
function matchAt(raw: string, i: number, to: number, marks: ReadonlySet<InlineMark>): Match | undefined {
  const char = raw[i]

  if (char === '`') {
    const close = raw.indexOf('`', i + 1)
    if (close < 0 || close >= to || close === i + 1) return undefined
    return { mark: 'code', innerStart: i + 1, innerEnd: close, end: close + 1 }
  }

  if (raw.startsWith('**', i) && !marks.has('bold')) {
    if (isSpace(raw[i + 2]) || raw[i + 2] === '*') return undefined
    let close = raw.indexOf('**', i + 3)
    while (close >= 0 && close + 2 <= to && isSpace(raw[close - 1])) close = raw.indexOf('**', close + 1)
    if (close < 0 || close + 2 > to) return undefined
    return { mark: 'bold', innerStart: i + 2, innerEnd: close, end: close + 2 }
  }

  if (char === '*' && raw[i + 1] !== '*' && !marks.has('italic')) {
    if (isSpace(raw[i + 1])) return undefined
    for (let close = raw.indexOf('*', i + 2); close >= 0 && close < to; close = raw.indexOf('*', close + 1)) {
      // A `**` is bold's, not the end of this italic.
      if (raw[close + 1] === '*') {
        close += 1
        continue
      }
      if (!isSpace(raw[close - 1])) return { mark: 'italic', innerStart: i + 1, innerEnd: close, end: close + 1 }
    }
    return undefined
  }

  if (char === '[' && !marks.has('link')) {
    const labelEnd = raw.indexOf('](', i + 1)
    if (labelEnd < 0 || labelEnd === i + 1) return undefined
    const urlEnd = raw.indexOf(')', labelEnd + 2)
    if (urlEnd < 0 || urlEnd >= to) return undefined
    const href = raw.slice(labelEnd + 2, urlEnd)
    if (!SAFE_HREF.test(href) || /\s/.test(href)) return undefined
    return { mark: 'link', innerStart: i + 1, innerEnd: labelEnd, end: urlEnd + 1, href }
  }

  return undefined
}

function sameMarks(a: ReadonlySet<InlineMark>, b: ReadonlySet<InlineMark>): boolean {
  return a.size === b.size && [...a].every((mark) => b.has(mark))
}

/**
 * The raw offset of the character at `visible` in the text shown. Used when the
 * caret enters a formatted block: the block turns raw, and the caret has to land
 * on the same character it was on.
 */
export function rawOffsetOf(raw: string, visible: number): number {
  let seen = 0
  for (const segment of parseInline(raw)) {
    if (visible < seen + segment.text.length) return segment.rawStart + (visible - seen)
    seen += segment.text.length
  }
  return raw.length
}
