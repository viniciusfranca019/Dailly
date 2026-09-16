/**
 * Identity, injected for the same reason the clock is.
 *
 * [ADR 0002 §6](../../../docs/adrs/0002-data-layer.md) decided ids are UUIDs
 * generated on the client, not autoincrement: an id that is stable no matter
 * which file a restore came from. Generating one is a side effect, so it enters
 * through the composition root like any other — which also makes `createEntry`
 * deterministic in a test without stubbing a global.
 */

export interface IdGenerator {
  next(): string
}

/**
 * `crypto.randomUUID` exists in the browser and in Node, but this package
 * declares neither lib. Reading it off `globalThis` behind a narrow type keeps
 * the package free of both — and fails loudly rather than silently producing
 * colliding ids if it is ever absent.
 */
export const uuidIds: IdGenerator = {
  next: () => {
    const host = globalThis as { crypto?: { randomUUID?: () => string } }
    const randomUUID = host.crypto?.randomUUID
    if (!randomUUID) {
      throw new Error('crypto.randomUUID is unavailable; pass an IdGenerator explicitly')
    }
    return randomUUID.call(host.crypto)
  },
}

/** Deterministic ids for tests: `entry-1`, `entry-2`, … */
export const sequentialIds = (prefix = 'entry'): IdGenerator => {
  let issued = 0
  return { next: () => `${prefix}-${++issued}` }
}
