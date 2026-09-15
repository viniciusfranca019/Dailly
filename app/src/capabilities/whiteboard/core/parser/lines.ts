/** Phase 1 of parsing: raw text -> indentation-aware lines. */

export interface SourceLine {
  /** 0-based index in the original source. */
  readonly number: number
  /** Indentation width in spaces (a tab counts as `tabWidth`). */
  readonly indent: number
  /** The line with its indentation stripped, right-trimmed. */
  readonly content: string
  readonly blank: boolean
}

export interface ScanOptions {
  readonly tabWidth?: number
}

export const DEFAULT_TAB_WIDTH = 4

/** Split source into lines, measuring indentation and flagging blanks. */
export function scanLines(source: string, options: ScanOptions = {}): SourceLine[] {
  const tabWidth = options.tabWidth ?? DEFAULT_TAB_WIDTH

  return source.split(/\r\n|\r|\n/).map((raw, number) => {
    let indent = 0
    let i = 0
    for (; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === ' ') indent += 1
      else if (ch === '\t') indent += tabWidth - (indent % tabWidth)
      else break
    }

    const content = raw.slice(i).trimEnd()
    return { number, indent, content, blank: content.length === 0 }
  })
}
