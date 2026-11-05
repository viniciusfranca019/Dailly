import type { NewTask, Task, TaskBoard, TaskPatch } from '@dailly/tasks-core'

/**
 * The port of the Tasks module, in the words of the screen that consumes it.
 *
 * Not the `TaskStore` of `@dailly/tasks-core`: that is the server's port, with
 * nothing more than the screen calls. A refusal arrives as an `Error` whose message is the one to show
 * ("o título é obrigatório", "não consegui falar com a API local").
 */
export interface TasksPort {
  board(): Promise<TaskBoard>
  create(input: NewTask): Promise<Task>
  /**
   * One save, any subset: the board's drag sends a placement (card #21), the
   * panel the fields the person edited (card #22). `null` when the task no
   * longer exists, which the panel shows as "tarefa não encontrada".
   */
  update(key: number, patch: TaskPatch): Promise<Task | null>
  /** `false` when the task was already gone. */
  delete(key: number): Promise<boolean>
}

export type { NewTask, Placement, Task, TaskBoard, TaskPatch, TaskStatus } from '@dailly/tasks-core'
