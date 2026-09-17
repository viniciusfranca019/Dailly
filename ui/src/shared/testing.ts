import {
  createEntry,
  inMemoryEntryRepository,
  queryEntries,
  sequentialIds,
  type Clock,
  type Entry,
} from '@dailly/domain'
import { UTC, type TimeZone } from '@dailly/periods'
import type { ModuleDeps } from '@shared'

/**
 * The dependencies a shell test runs on: the **real** use-cases over the
 * in-memory store, not stubs.
 *
 * Stubbing the use-cases here would make these tests agree with themselves —
 * they would pass with a `createEntry` that never normalizes or a
 * `queryEntries` that never orders. Composing the real ones over a fake store
 * keeps the only fake at the boundary where fakes belong.
 *
 * It lives in `shared/` and not in `shell/` because the architecture test said
 * so, out loud: nothing outside the shell may import the shell, and a Daily Log
 * test needed these deps too. The rule was right and the convenient placement
 * was wrong — this is not composition, it is a fixture that happens to compose.
 */
/**
 * A clock that moves, one minute per reading.
 *
 * `fixedClock` would be the obvious choice and it is the wrong one here: two
 * entries saved in the same test would share an instant *and* a `createdAt`,
 * leaving them with no defined order — the repository's tie-break has nothing
 * left to break. Real time advances between two saves, and a fixture that
 * pretends otherwise tests a situation that cannot happen.
 */
const advancingClock = (from = '2026-09-16T12:00:00.000Z'): Clock => {
  let readings = 0
  return { now: () => new Date(Date.parse(from) + readings++ * 60_000).toISOString() }
}

export function testModuleDeps(
  options: { seed?: readonly Entry[]; zone?: TimeZone; now?: string } = {},
): ModuleDeps {
  const entries = inMemoryEntryRepository(options.seed ?? [])
  const clock = advancingClock(options.now)
  return {
    createEntry: createEntry({ entries, clock, ids: sequentialIds() }),
    now: () => options.now ?? '2026-09-16T12:00:00.000Z',
    queryEntries: queryEntries({ entries }),
    zone: options.zone ?? UTC,
  }
}
