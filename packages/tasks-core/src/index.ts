/**
 * `@dailly/tasks-core`: the Tasks model, pure, shared by `ui/` and `server/`.
 *
 * The task, its boards, statuses and priorities, the `<PREFIX>-<n>` key, the manual order
 * (`rankBetween`) and the `TaskStore` port. No DOM, no Node, no network.
 */
export {
  BoardNotFoundError,
  InvalidPrefixError,
  NameRequiredError,
  PREFIX_MAX_LENGTH,
  PrefixTakenError,
  SEED_BOARD,
  normalizeBoardName,
  normalizePrefix,
} from './board.js'
export type { Board, BoardPatch, NewBoard } from './board.js'
export { CommentRequiredError, normalizeCommentBody } from './comment.js'
export type { TaskComment } from './comment.js'
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
export type { Priority, StatusCategory, Task, TaskKey, TaskStatus } from './task.js'
export type { CommentDeletion, NewTask, TaskBoard, TaskPatch, TaskStore } from './task-store.js'
