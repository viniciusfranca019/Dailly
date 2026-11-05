/**
 * `@dailly/tasks-core`: the Tasks model, pure, shared by `ui/` and `server/`.
 *
 * The task, its statuses and priorities, the `T-<n>` key, the manual order
 * (`rankBetween`) and the `TaskStore` port. No DOM, no Node, no network.
 */
export { rankBetween } from './rank.js'
export { orderTasks } from './in-memory-task-store.js'
export {
  DEFAULT_STATUSES,
  PRIORITY_LABELS,
  StatusNotFoundError,
  TitleRequiredError,
  formatKey,
  normalizeTitle,
  parseKey,
} from './task.js'
export type { Priority, StatusCategory, Task, TaskStatus } from './task.js'
export type { NewTask, TaskBoard, TaskStore } from './task-store.js'
