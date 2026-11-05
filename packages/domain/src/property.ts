/**
 * A property of a day log (PRD Fase 2, RN3, card #35): the value lives in the
 * entry's `props`, and the type of each key lives in one definition, born on
 * the key's first use, so "horas" is a number in every entry.
 */
export const PROPERTY_TYPES = ['text', 'number', 'boolean'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]
export type PropertyValue = string | number | boolean

export interface PropertyDef {
  readonly key: string
  readonly type: PropertyType
}

/** How the screen names each type, in the suggestion ("humor · texto"). */
export const PROPERTY_TYPE_NAMES: Record<PropertyType, string> = {
  text: 'texto',
  number: 'número',
  boolean: 'sim/não',
}

export const isPropertyType = (value: unknown): value is PropertyType =>
  typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)

/** The key as stored: trimmed, and `null` when nothing is left (C5). */
export function normalizePropertyKey(key: string): string | null {
  const trimmed = key.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * What a typed value becomes, or why it is refused (C4). A number accepts
 * the comma the person writes; yes/no accepts "sim" and "não".
 */
export function parsePropertyValue(
  key: string,
  type: PropertyType,
  raw: string,
): { value: PropertyValue } | { error: string } {
  const text = raw.trim()
  if (type === 'number') {
    const value = Number(text.replace(',', '.'))
    return text !== '' && Number.isFinite(value) ? { value } : { error: `${key} espera um número` }
  }
  if (type === 'boolean') {
    if (text === 'sim') return { value: true }
    if (text === 'não') return { value: false }
    return { error: `${key} espera sim ou não` }
  }
  return text === '' ? { error: `${key} precisa de um valor` } : { value: text }
}

/** Whether a stored value is of a type; the store guards with it (C7). */
export function matchesType(type: PropertyType, value: unknown): value is PropertyValue {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string' && value.trim() !== ''
}

/** The value as the timeline shows it: "sim"/"não", the comma of pt-BR. */
export function formatPropertyValue(value: PropertyValue): string {
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (typeof value === 'number') return String(value).replace('.', ',')
  return value
}
