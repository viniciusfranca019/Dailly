import type { FocusBoard, FocusLevel, ProgramWithTasks, Task, TaskBoard } from '@dailly/tasks-core'

/**
 * The board seen through the program and focus filters, beside the label one:
 * each cut keeps every status, since the columns are where tasks are born, and
 * an empty selection leaves the board as it came. Inside one filter the chips
 * add up (OR); the filters compose (AND) by cutting one after the other. The
 * cut happens here, over the reads already on screen, as the label one does.
 */

const wholeKey = (task: Task) => `${task.keyPrefix}-${task.key}`

const keep = (board: TaskBoard, keys: ReadonlySet<string>, also: (task: Task) => boolean = () => true): TaskBoard => ({
  statuses: board.statuses,
  tasks: board.tasks.filter((task) => keys.has(wholeKey(task)) && also(task)),
})

const keysOf = (programs: readonly ProgramWithTasks[], ids: ReadonlySet<string>) =>
  programs.filter((program) => ids.has(program.id)).flatMap((program) => program.tasks.map((task) => task.key))

/** The tasks of any of the programs on, matched by their whole key, since a program spans boards. */
export function filterByPrograms(
  board: TaskBoard,
  programs: readonly ProgramWithTasks[],
  programIds: readonly string[],
): TaskBoard {
  if (programIds.length === 0) return board
  return keep(board, new Set(keysOf(programs, new Set(programIds))))
}

/**
 * The tasks in any of the levels on: a loose task put there, or a task of a
 * program put there. What is finished is not in focus anymore, so a task whose
 * status is completed or canceled stays out, read by its category (RN3), never
 * its name.
 */
export function filterByFocus(
  board: TaskBoard,
  programs: readonly ProgramWithTasks[],
  focus: FocusBoard,
  levels: readonly FocusLevel[],
): TaskBoard {
  if (levels.length === 0) return board
  const items = levels.flatMap((level) => focus[level])
  const programIds = new Set(items.flatMap((item) => (item.kind === 'program' ? [item.id] : [])))
  const loose = items.flatMap((item) => (item.kind === 'task' ? [item.key] : []))
  const finished = new Set(
    board.statuses.filter((status) => status.category === 'completed' || status.category === 'canceled').map((s) => s.id),
  )
  return keep(board, new Set([...loose, ...keysOf(programs, programIds)]), (task) => !finished.has(task.statusId))
}
