/**
 * A request to open a task, left by the search for the Tasks screen (card
 * #47, J10.3). The shell carries no request: the search navigates to
 * `/tasks` and leaves the board and the key here, and `Tasks.vue` takes it,
 * whether it mounts now or was already on the screen.
 */
export interface OpenRequest {
  readonly boardId: string
  readonly prefix: string
  readonly key: number
}

let pending: OpenRequest | null = null
const listeners = new Set<() => void>()

export function requestOpen(request: OpenRequest): void {
  pending = request
  for (const listener of listeners) listener()
}

/** The pending request, taken once: a second read finds nothing. */
export function takeOpen(): OpenRequest | null {
  const taken = pending
  pending = null
  return taken
}

/** Called when a request arrives; returns the unsubscribe. */
export function onOpenRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
