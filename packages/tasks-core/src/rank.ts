/**
 * The manual order of a column, as a string that sorts between its neighbours.
 *
 * A fractional index rather than an integer position, because moving one task
 * then writes one row instead of renumbering the column (the PRD's annex, J2.2).
 * Ranks are digits in base 36 read as a fraction after the point: `'i'` is
 * 18/36, `'ii'` sits just above it. They never end in `'0'`, since `'a'` and
 * `'a0'` would be the same number with two spellings, and then nothing could
 * fit between them.
 *
 * The algorithm is the midpoint of the `fractional-indexing` package (MIT),
 * written out here because a dependency for twenty lines is the kind the
 * card's Latitude stops on.
 */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

const digit = (char: string): number => {
  const value = DIGITS.indexOf(char)
  if (value < 0) throw new RangeError(`rank com dígito inválido: ${char}`)
  return value
}

/** `low` may be `''` (the bottom); `high` may be `null` (the top). */
function midpoint(low: string, high: string | null): string {
  if (high !== null) {
    let shared = 0
    while ((low[shared] ?? '0') === high[shared]) shared += 1
    if (shared > 0) return high.slice(0, shared) + midpoint(low.slice(shared), high.slice(shared))
  }
  const lowDigit = low ? digit(low[0] as string) : 0
  const highDigit = high !== null ? digit(high[0] as string) : BASE
  if (highDigit - lowDigit > 1) return DIGITS[Math.round((lowDigit + highDigit) / 2)] as string
  if (high !== null && high.length > 1) return high.slice(0, 1)
  return (DIGITS[lowDigit] as string) + midpoint(low.slice(1), null)
}

/**
 * A rank strictly between `before` and `after`; either may be absent, which
 * means the edge of the column. `rankBetween(undefined, first)` is the top.
 */
export function rankBetween(before: string | undefined, after: string | undefined): string {
  if (before !== undefined && after !== undefined && before >= after) {
    throw new RangeError(`rank fora de ordem: ${before} não vem antes de ${after}`)
  }
  return midpoint(before ?? '', after ?? null)
}
