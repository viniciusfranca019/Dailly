import type { NewTask, Task, TaskBoard } from '@dailly/tasks-core'

/**
 * The port of the Tasks module, in the words of the screen that consumes it.
 *
 * Not the `TaskStore` of `@dailly/tasks-core`: that is the server's port, with
 * the delete the F1 screen does not call. Here are only the two calls the list
 * makes. A refusal arrives as an `Error` whose message is the one to show
 * ("o título é obrigatório", "não consegui falar com a API local").
 */
export interface TasksPort {
  board(): Promise<TaskBoard>
  create(input: NewTask): Promise<Task>
}

export type { NewTask, Task, TaskBoard, TaskStatus } from '@dailly/tasks-core'
