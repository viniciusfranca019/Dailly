/**
 * A label (PRD Fase 2, RN1): global, the same for day logs and tasks, with a
 * name unique regardless of case and one color of a fixed palette.
 *
 * The palette is names, not hex: the screen maps each name to its tokens, so a
 * theme change never rewrites stored data.
 */
export const LABEL_COLORS = ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'gray'] as const

export type LabelColor = (typeof LABEL_COLORS)[number]

export interface Label {
  readonly id: string
  readonly name: string
  readonly color: LabelColor
}

export const isLabelColor = (value: unknown): value is LabelColor =>
  typeof value === 'string' && (LABEL_COLORS as readonly string[]).includes(value)

/** The name as stored: trimmed, and `null` when nothing is left (C3). */
export function normalizeLabelName(name: string): string | null {
  const trimmed = name.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * What uniqueness compares (C4): case-folded with the locale, so "Saúde" and
 * "SAÚDE" collide. SQLite's `lower()` folds ASCII only, which is why the key
 * is computed here and stored, not derived in SQL.
 */
export const labelKey = (name: string): string => name.trim().toLocaleLowerCase('pt-BR')

export function findByName<L extends Pick<Label, 'name'>>(labels: readonly L[], name: string): L | undefined {
  const key = labelKey(name)
  return labels.find((label) => labelKey(label.name) === key)
}

/** The first palette color no label uses yet; once all are used, the cycle restarts. */
export function nextColor(labels: readonly Pick<Label, 'color'>[]): LabelColor {
  const used = new Set(labels.map((label) => label.color))
  return LABEL_COLORS.find((color) => !used.has(color)) ?? LABEL_COLORS[labels.length % LABEL_COLORS.length]!
}
