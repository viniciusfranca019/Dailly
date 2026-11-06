import type {
  Board,
  BoardPatch,
  NewBoard,
  NewStatus,
  NewTask,
  StatusPatch,
  Task,
  TaskBoard,
  TaskComment,
  TaskKey,
  TaskPatch,
  TaskSearchResult,
  TaskStatus,
} from '@dailly/tasks-core'

/**
 * The port of the Tasks module, in the words of the screen that consumes it.
 *
 * Not the `TaskStore` of `@dailly/tasks-core`: that is the server's port, with
 * nothing more than the screen calls. A refusal arrives as an `Error` whose message is the one to show
 * ("o título é obrigatório", "o prefixo T já foi usado por um board", "não
 * consegui falar com a API local").
 */
export interface TasksPort {
  /** By creation, "Tasks" first (card #42). */
  boards(): Promise<readonly Board[]>
  createBoard(input: NewBoard): Promise<Board>
  /** `null` when the board no longer exists. */
  updateBoard(id: string, patch: BoardPatch): Promise<Board | null>
  /** One board's statuses and tasks; `null` when the board no longer exists. */
  board(boardId: string): Promise<TaskBoard | null>
  create(input: NewTask): Promise<Task>
  /**
   * One save, any subset: the board's drag sends a placement (card #21), the
   * panel the fields the person edited (card #22). `null` when the task no
   * longer exists, which the panel shows as "tarefa não encontrada".
   */
  update(key: TaskKey, patch: TaskPatch): Promise<Task | null>
  /** `false` when the task was already gone. */
  delete(key: TaskKey): Promise<boolean>
  /** Oldest first (card #45); `null` when the task no longer exists. */
  comments(key: TaskKey): Promise<readonly TaskComment[] | null>
  /** `null` when the task no longer exists; throws on a refusal. */
  addComment(key: TaskKey, body: string): Promise<TaskComment | null>
  /** `false` when the comment or its task was already gone. */
  deleteComment(key: TaskKey, id: string): Promise<boolean>
  /** A new status in the board (card #43); `null` when the board is gone; throws on a refusal. */
  addStatus(boardId: string, input: NewStatus): Promise<TaskStatus | null>
  /** Rename or recolor; `null` when the status is gone; throws on a refusal. */
  updateStatus(id: string, patch: StatusPatch): Promise<TaskStatus | null>
  /** Its tasks go on top of `moveTo`; `false` when the status was gone; throws on a refusal. */
  deleteStatus(id: string, moveTo?: string): Promise<boolean>
  /** Tasks of every board by key or part of the title (card #47); the API is not called for empty text. */
  search(text: string): Promise<readonly TaskSearchResult[]>
}

export type {
  Board,
  BoardPatch,
  NewBoard,
  NewStatus,
  NewTask,
  Placement,
  StatusColor,
  StatusPatch,
  Task,
  TaskBoard,
  TaskComment,
  TaskKey,
  TaskPatch,
  TaskSearchResult,
  TaskStatus,
} from '@dailly/tasks-core'
