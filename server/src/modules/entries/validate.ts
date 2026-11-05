import {
  matchesType,
  parsePropertyValue,
  propertyRefusal,
  type Entry,
  type EntryFilter,
  type EntryPatch,
  type PropertyDef,
  type PropertyValue,
} from '@dailly/domain'

/**
 * What the API checks before letting something into the store.
 *
 * The domain already built this record — `createEntry` ran on the renderer. So
 * why check again? Because the API is reachable from outside the domain:
 * anything on this machine can POST here. Guarding the store is not redoing the
 * domain (ADR 0002, Emenda 1); it is refusing to be the hole in it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** ISO-8601, UTC, with milliseconds — the exact shape `Clock` produces. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface Invalid {
  readonly field: string
  readonly message: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a posted entry, returning every problem rather than the first.
 *
 * All of them, because a client fixing one field at a time across four round
 * trips is a worse API than one that says what is wrong once.
 */
export function validateEntry(payload: unknown): { entry: Entry } | { errors: Invalid[] } {
  if (!isRecord(payload)) {
    return { errors: [{ field: '', message: 'o corpo da requisição deve ser um objeto JSON' }] }
  }

  const errors: Invalid[] = []
  const { id, body, occurredAt, createdAt, updatedAt, labelIds, props } = payload

  if (typeof id !== 'string' || !UUID.test(id)) {
    errors.push({ field: 'id', message: 'deve ser um UUID' })
  }

  // Empty is rejected here too, even though `createEntry` already refuses it.
  // The rule is the product's ("o corpo é obrigatório"), not one layer's.
  if (typeof body !== 'string' || body.trim() === '') {
    errors.push({ field: 'body', message: 'é obrigatório' })
  }

  for (const [field, value] of [
    ['occurredAt', occurredAt],
    ['createdAt', createdAt],
    ['updatedAt', updatedAt],
  ] as const) {
    if (typeof value !== 'string' || !INSTANT.test(value)) {
      errors.push({ field, message: 'deve ser um instante ISO-8601 em UTC, como 2026-07-24T10:00:00.000Z' })
    }
  }

  if (labelIds !== undefined && !(Array.isArray(labelIds) && labelIds.every((id) => typeof id === 'string'))) {
    errors.push({ field: 'labelIds', message: 'deve ser uma lista de ids' })
  }

  if (props !== undefined && !isRecord(props)) {
    errors.push({ field: 'props', message: 'deve ser um objeto' })
  }

  if (errors.length > 0) return { errors }

  return {
    entry: {
      id: id as string,
      body: body as string,
      occurredAt: occurredAt as string,
      createdAt: createdAt as string,
      updatedAt: updatedAt as string,
      labelIds: (labelIds as string[] | undefined) ?? [],
      props: (props as Record<string, unknown> | undefined) ?? {},
    },
  }
}

/** `from`/`to` are calendar days; anything else is a client bug worth naming. */
export function validateRange(query: { from?: unknown; to?: unknown }): Invalid[] {
  const errors: Invalid[] = []
  for (const [field, value] of [
    ['from', query.from],
    ['to', query.to],
  ] as const) {
    if (value === undefined) continue
    if (typeof value !== 'string' || !CALENDAR_DAY.test(value)) {
      errors.push({ field, message: 'deve ser uma data no formato YYYY-MM-DD' })
    }
  }
  return errors
}

/** What a correction may change (PRD Fase 2, RN5); anything else is refused. */
const PATCHABLE = new Set(['body', 'occurredAt', 'labelIds', 'props', 'updatedAt'])

/**
 * Validate a correction. `updatedAt` is required because the renderer's
 * `updateEntry` stamps it, and a patch without it would leave the entry
 * claiming it never changed.
 */
export function validatePatch(payload: unknown): { patch: EntryPatch } | { errors: Invalid[] } {
  if (!isRecord(payload)) {
    return { errors: [{ field: '', message: 'o corpo da requisição deve ser um objeto JSON' }] }
  }

  const errors: Invalid[] = Object.keys(payload)
    .filter((field) => !PATCHABLE.has(field))
    .map((field) => ({ field, message: 'não se altera numa correção' }))
  const { body, occurredAt, labelIds, props, updatedAt } = payload

  if (body !== undefined && (typeof body !== 'string' || body.trim() === '')) {
    errors.push({ field: 'body', message: 'é obrigatório' })
  }
  if (occurredAt !== undefined && (typeof occurredAt !== 'string' || !INSTANT.test(occurredAt))) {
    errors.push({ field: 'occurredAt', message: 'deve ser um instante ISO-8601 em UTC, como 2026-07-24T10:00:00.000Z' })
  }
  if (labelIds !== undefined && !(Array.isArray(labelIds) && labelIds.every((id) => typeof id === 'string'))) {
    errors.push({ field: 'labelIds', message: 'deve ser uma lista de ids' })
  }
  if (props !== undefined && !isRecord(props)) {
    errors.push({ field: 'props', message: 'deve ser um objeto' })
  }
  if (typeof updatedAt !== 'string' || !INSTANT.test(updatedAt)) {
    errors.push({ field: 'updatedAt', message: 'deve ser um instante ISO-8601 em UTC, como 2026-07-24T10:00:00.000Z' })
  }

  if (errors.length > 0) return { errors }
  return {
    patch: {
      ...(props !== undefined ? { props: props as Record<string, unknown> } : {}),
      updatedAt: updatedAt as string,
      ...(body !== undefined ? { body: body as string } : {}),
      ...(occurredAt !== undefined ? { occurredAt: occurredAt as string } : {}),
      ...(labelIds !== undefined ? { labelIds: labelIds as string[] } : {}),
    },
  }
}

/**
 * Every property of an entry needs a defined key and a value of its type
 * (PRD Fase 2, RN3, card #35). The store is the last guard: the screen checks
 * first, and anything else on this machine can still POST.
 */
export function checkProps(props: Readonly<Record<string, unknown>>, defs: readonly PropertyDef[]): Invalid[] {
  const types = new Map(defs.map((def) => [def.key, def.type]))
  return Object.entries(props).flatMap(([key, value]) => {
    const type = types.get(key)
    if (!type) return [{ field: 'props', message: `${key} não tem tipo definido` }]
    return matchesType(type, value) ? [] : [{ field: 'props', message: propertyRefusal(key, type) }]
  })
}

/**
 * The label and property half of the listing filter (card #36). Labels come
 * as `labelIds=a,b`; each property as `props[key]=value`, read by the type of
 * its key, so "7,5" is the number 7.5 and "sim" is true.
 */
export function parseFilter(
  query: Record<string, unknown>,
  defs: readonly PropertyDef[],
): { filter: Pick<EntryFilter, 'labelIds' | 'props'> } | { errors: Invalid[] } {
  const errors: Invalid[] = []
  const filter: { labelIds?: string[]; props?: Record<string, PropertyValue> } = {}

  if (query['labelIds'] !== undefined) {
    const ids = typeof query['labelIds'] === 'string' ? query['labelIds'].split(',').filter((id) => id !== '') : []
    if (ids.length === 0) errors.push({ field: 'labelIds', message: 'deve ser uma lista de ids separados por vírgula' })
    else filter.labelIds = ids
  }

  const types = new Map(defs.map((def) => [def.key, def.type]))
  for (const [name, raw] of Object.entries(query)) {
    const match = /^props\[(.+)\]$/.exec(name)
    if (!match) continue
    const key = match[1]!
    const type = types.get(key)
    if (!type) {
      errors.push({ field: 'props', message: `${key} não tem tipo definido` })
      continue
    }
    const parsed = parsePropertyValue(key, type, typeof raw === 'string' ? raw : '')
    if ('error' in parsed) errors.push({ field: 'props', message: parsed.error })
    else filter.props = { ...filter.props, [key]: parsed.value }
  }

  return errors.length > 0 ? { errors } : { filter }
}
