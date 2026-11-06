import type { Board, BoardPatch, NewBoard, NewTask, Task, TaskBoard, TaskKey, TaskPatch } from '@dailly/tasks-core'

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
}

export type {
  Board,
  BoardPatch,
  NewBoard,
  NewTask,
  Placement,
  Task,
  TaskBoard,
  TaskKey,
  TaskPatch,
  TaskStatus,
} from '@dailly/tasks-core'
