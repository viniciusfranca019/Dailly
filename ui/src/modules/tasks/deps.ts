import type { TasksPort } from '@shared'

/** What is only the Tasks module's: the port to the tasks. */
export interface TasksDeps {
  readonly tasks: TasksPort
}
