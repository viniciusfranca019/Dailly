import type { Board, BoardPatch, NewBoard } from './board.js'
import type { TaskComment } from './comment.js'
import type { Placement } from './move.js'
import type { TaskSearchResult } from './search.js'
import type { NewStatus, StatusPatch } from './status.js'
import type { Priority, Task, TaskKey, TaskStatus } from './task.js'

export interface NewTask {
  readonly boardId: string
  readonly title: string
  readonly statusId: string
  /** Chosen in the quick create (card #48); absent, the task is born "sem" (RN8). */
  readonly priority?: Priority
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
  /** The whole set, replacing the one the task had (card #46). */
  readonly labelIds?: readonly string[]
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
 * The store assigns `key` and `rank`, not the caller: the key is a counter of
 * the board that has to survive a delete (RN5), and only the store sees the
 * whole column.
 */
export interface TaskStore {
  /** By creation, the seed board ("Tasks") first. */
  boards(): Promise<readonly Board[]>
  /**
   * Throws `NameRequiredError`, `InvalidPrefixError` or `PrefixTakenError`
   * (RN9: any prefix a board ever used); nothing is written then.
   */
  createBoard(input: NewBoard): Promise<Board>
  /**
   * `null` when no board has that id. A new prefix only changes the tasks
   * created after (RN5); the old one stays reserved for this board (RN9).
   */
  updateBoard(id: string, patch: BoardPatch): Promise<Board | null>
  /** One board's statuses and tasks; `null` when no board has that id. */
  board(boardId: string): Promise<TaskBoard | null>
  /**
   * The task takes the board's next number and its current prefix. Throws
   * `BoardNotFoundError`, `TitleRequiredError` or `StatusNotFoundError`;
   * nothing is written then.
   */
  create(input: NewTask): Promise<Task>
  /**
   * Apply a patch; a placement applies RN3 with the store's clock. `null` when
   * no task has that key. Throws `TitleRequiredError`, `InvalidPriorityError`,
   * `StatusNotFoundError`, `InvalidRankError` or `InvalidLabelError`, and nothing changes then:
   * every field is checked before the first write.
   */
  update(key: TaskKey, patch: TaskPatch): Promise<Task | null>
  /** `false` when no task has that key. */
  delete(key: TaskKey): Promise<boolean>
  /**
   * A task's comments, oldest first, ties broken by id (card #45). `null`
   * when no task has that key.
   */
  comments(key: TaskKey): Promise<readonly TaskComment[] | null>
  /**
   * Stamped with the store's clock. `null` when no task has that key; throws
   * `CommentRequiredError` for an empty body, and nothing is written then.
   */
  addComment(key: TaskKey, body: string): Promise<TaskComment | null>
  /** A comment of another task is not found, as one that does not exist. */
  deleteComment(key: TaskKey, id: string): Promise<CommentDeletion>
  /**
   * A new status in the board, placed after the others of its category
   * (card #43, RN11). `null` when no board has that id. Throws
   * `NameRequiredError`, `StatusNameTakenError`, `InvalidCategoryError` or
   * `InvalidColorError`; nothing is written then.
   */
  addStatus(boardId: string, input: NewStatus): Promise<TaskStatus | null>
  /** Rename or recolor (J6.2); the tasks in it do not change. `null` when no status has that id. */
  updateStatus(id: string, patch: StatusPatch): Promise<TaskStatus | null>
  /**
   * Delete a status (J6.3, J6.4). Its tasks go on top of `moveTo`, in their
   * order, through RN3, in the same write (RN12). `false` when no status has
   * that id. Throws `LastStatusError`, `StatusHasTasksError` (tasks and no
   * `moveTo`) or `InvalidMoveToError` (itself, another board's, or none);
   * nothing changes then.
   */
  deleteStatus(id: string, moveTo?: string): Promise<boolean>
  /**
   * Tasks of every board by key or part of the title (card #47): the exact key
   * first, then the most recent, at most `SEARCH_LIMIT`. Empty text finds none.
   */
  search(text: string): Promise<readonly TaskSearchResult[]>
}

export type CommentDeletion = 'deleted' | 'task-not-found' | 'comment-not-found'
