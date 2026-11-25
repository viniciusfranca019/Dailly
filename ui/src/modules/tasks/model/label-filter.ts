import type { TaskBoard } from '@dailly/tasks-core'

/**
 * The board seen through the label filter: the tasks carrying any of the
 * labels toggled on (OR, as the Daily Log's timeline), every status kept,
 * because the columns are where tasks are born and statuses managed. With no
 * label on, the board is the API's, untouched. The cut happens here and not
 * on the server: board and list are one read (RN4), already on screen.
 */
export function filterByLabels(board: TaskBoard, labelIds: readonly string[]): TaskBoard {
  if (labelIds.length === 0) return board
  return { statuses: board.statuses, tasks: board.tasks.filter((task) => task.labelIds.some((id) => labelIds.includes(id))) }
}
