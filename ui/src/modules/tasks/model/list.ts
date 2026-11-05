import type { Task, TaskBoard, TaskStatus } from '@dailly/tasks-core'

export interface StatusGroup {
  readonly status: TaskStatus
  readonly tasks: readonly Task[]
}

/**
 * The list view: one group per status, in the statuses' order, each holding
 * its tasks in the order the API sent (status, then rank). Empty statuses keep
 * their group, because their "+" is where a task in that status is born.
 */
export function groupByStatus(board: TaskBoard): StatusGroup[] {
  return board.statuses.map((status) => ({
    status,
    tasks: board.tasks.filter((task) => task.statusId === status.id),
  }))
}

/** The status the empty state's invitation creates in: the first "to do". */
export function firstToDo(board: TaskBoard): TaskStatus | undefined {
  return board.statuses.find((status) => status.category === 'unstarted') ?? board.statuses[0]
}
