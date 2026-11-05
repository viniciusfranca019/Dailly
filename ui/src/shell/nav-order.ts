/**
 * The order the person gave the sidebar, kept apart from the manifest.
 *
 * The manifest stays the source of *which* modules exist; this only says in
 * what order they are shown. So the saved value is a list of ids that is
 * reconciled against the manifest on every read: a module turned on by a flag
 * after the save goes to the end, and one turned off is simply not there.
 */

export const ORDER_KEY = 'dailly.nav.order'

/** The manifest, in the saved order; unknown ids dropped, new modules last. */
export function arrange<M extends { readonly id: string }>(
  modules: readonly M[],
  saved: readonly string[],
): M[] {
  const rank = new Map(saved.map((id, i) => [id, i]))
  const position = (module: M, i: number) => rank.get(module.id) ?? saved.length + i
  return modules
    .map((module, i) => ({ module, at: position(module, i) }))
    .sort((a, b) => a.at - b.at)
    .map(({ module }) => module)
}

/** `id` takes the place `target` had: before it going up, after it going down. */
export function moveOnto(order: readonly string[], id: string, target: string): string[] {
  const from = order.indexOf(id)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const next = order.filter((x) => x !== id)
  next.splice(to, 0, id)
  return next
}

/** One place up (-1) or down (+1), stopping at the ends. */
export function moveBy(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = order.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return [...order]
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

type StorageAccess = () => Storage | undefined

/**
 * A storage that is missing, throws (private window, blocked site data) or
 * holds anything but a list of strings reads as "no order": the manifest's.
 */
export function readOrder(storage: StorageAccess): string[] {
  try {
    const raw = storage()?.getItem(ORDER_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every((x) => typeof x === 'string') ? value : []
  } catch {
    return []
  }
}

export function writeOrder(storage: StorageAccess, order: readonly string[]): void {
  try {
    storage()?.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    // sem storage, a ordem vale até recarregar
  }
}
