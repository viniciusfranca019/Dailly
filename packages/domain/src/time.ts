/**
 * The time contract, exactly as [ADR 0007](../../../docs/adrs/0007-api-local-e-tempo.md)
 * wrote it.
 *
 * `Clock` answers *"what instant is it now"* and nothing else. It does **not**
 * know a time zone. The other question — *"which calendar day does this instant
 * belong to"* — belongs to `@dailly/periods`, and keeping them apart is what
 * gives the project a single conversion point instead of N.
 */

/** An instant. Always UTC, ISO-8601 with `Z`. */
export type ISODateTime = string

export interface Clock {
  now(): ISODateTime
}

export const systemClock: Clock = { now: () => new Date().toISOString() }

/**
 * Not a nicety: without it, testing "an entry at 23:59 on the 31st" means
 * changing the machine's clock.
 */
export const fixedClock = (at: ISODateTime): Clock => ({ now: () => at })
