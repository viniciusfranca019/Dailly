/**
 * `@dailly/tasks-core`: the Tasks model, pure, shared by `ui/` and `server/`.
 *
 * The task, its statuses and priorities, the `T-<n>` key, the manual order
 * (`rankBetween`) and the `TaskStore` port. No DOM, no Node, no network.
 */
export { rankBetween } from './rank.js'
export { completionAfterMove, placeAt } from './move.js'
export type { Placement } from './move.js'
export {
  DEFAULT_STATUSES,
  InvalidPriorityError,
  InvalidRankError,
  PRIORITY_LABELS,
  StatusNotFoundError,
  TitleRequiredError,
  formatKey,
  isPriority,
  isRank,
  normalizeTitle,
  parseKey,
} from './task.js'
export type { Priority, StatusCategory, Task, TaskStatus } from './task.js'
export type { NewTask, TaskBoard, TaskPatch, TaskStore } from './task-store.js'
