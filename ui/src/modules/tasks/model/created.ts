import type { Task } from '@dailly/tasks-core'

/**
 * A task the quick create made (card #48, J11.2), told to the Tasks screen.
 * The shape of `open-request.ts`, with no pending state: a screen that is not
 * mounted reads the task anyway when it loads. The shell carries nothing.
 *
 * A listener answers whether it took the task, that is, whether the board on
 * the screen is the task's and reads it again. When none did, the form leaves
 * the short notice with the key ("CASA-2 criada").
 */
type Listener = (task: Task) => boolean

const listeners = new Set<Listener>()

/** `true` when a screen on the task's board took it. */
export function announceCreated(task: Task): boolean {
  let taken = false
  for (const listener of listeners) taken = listener(task) || taken
  return taken
}

/** Called for each task created; returns the unsubscribe. */
export function onTaskCreated(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
