import type { NewTask, Placement, Task, TaskBoard } from '@dailly/tasks-core'

/**
 * The port of the Tasks module, in the words of the screen that consumes it.
 *
 * Not the `TaskStore` of `@dailly/tasks-core`: that is the server's port, with
 * the delete the screen does not call yet. Here are only the calls the board
 * and the list make. A refusal arrives as an `Error` whose message is the one to show
 * ("o título é obrigatório", "não consegui falar com a API local").
 */
export interface TasksPort {
  board(): Promise<TaskBoard>
  create(input: NewTask): Promise<Task>
  /** The board's drag (card #21): the status and the rank where it was dropped. */
  move(key: number, placement: Placement): Promise<Task>
}

export type { NewTask, Placement, Task, TaskBoard, TaskStatus } from '@dailly/tasks-core'
