import type { Placement } from './move.js'
import type { Priority, Task, TaskStatus } from './task.js'

export interface NewTask {
  readonly title: string
  readonly statusId: string
}

/**
 * What one save changes; any subset (card #22). The board's drag sends only a
 * `placement`; the panel sends the fields the person edited.
 */
export interface TaskPatch {
  readonly title?: string
  readonly priority?: Priority
  readonly body?: string
  readonly placement?: Placement
}

/** Board and list are the same read (RN4): statuses and tasks, in order. */
export interface TaskBoard {
  /** By `position`. */
  readonly statuses: readonly TaskStatus[]
  /** By their status's position, then by `rank`. */
  readonly tasks: readonly Task[]
}

/**
 * The port the server module implements over SQLite.
 *
 * It lives here, next to the model, for the reason `RequestStore` lives in
 * `@dailly/requests-core`: whoever declares the need owns the port, and the
 * contract suite in `./testing` holds every implementation to it.
 *
 * The store assigns `key` and `rank`, not the caller: the key is a counter that
 * has to survive a delete (RN5), and only the store sees the whole column.
 */
export interface TaskStore {
  board(): Promise<TaskBoard>
  /** Throws `TitleRequiredError` or `StatusNotFoundError`; nothing is written then. */
  create(input: NewTask): Promise<Task>
  /**
   * Apply a patch; a placement applies RN3 with the store's clock. `null` when
   * no task has that key. Throws `TitleRequiredError`, `InvalidPriorityError`,
   * `StatusNotFoundError` or `InvalidRankError`, and nothing changes then:
   * every field is checked before the first write.
   */
  update(key: number, patch: TaskPatch): Promise<Task | null>
  /** `false` when no task has that key. */
  delete(key: number): Promise<boolean>
}
