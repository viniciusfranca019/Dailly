import type { Task, TaskStatus } from './task.js'

export interface NewTask {
  readonly title: string
  readonly statusId: string
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
  /** `false` when no task has that key. */
  delete(key: number): Promise<boolean>
}
