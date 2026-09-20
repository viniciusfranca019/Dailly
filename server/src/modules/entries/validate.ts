import type { Entry } from '@dailly/domain'

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
