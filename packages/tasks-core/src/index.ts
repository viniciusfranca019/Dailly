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
export { SEARCH_LIMIT, matchesTitle, searchKey } from './search.js'
export type { TaskSearchResult } from './search.js'
export { rankBetween } from './rank.js'
export { completionAfterMove, placeAt, ranksOnTop } from './move.js'
export {
  CATEGORY_ORDER,
  InvalidCategoryError,
  InvalidColorError,
  InvalidMoveToError,
  LastStatusError,
  SEED_STATUS_IDS,
  STATUS_COLORS,
  STATUS_SEED,
  StatusHasTasksError,
  StatusNameTakenError,
  isStatusCategory,
  isStatusColor,
  normalizeStatusName,
  orderStatuses,
  parseNewStatus,
  sameStatusName,
  seedStatusesFor,
} from './status.js'
export type { NewStatus, StatusColor, StatusPatch, StoredStatus } from './status.js'
export type { Placement } from './move.js'
export {
  InvalidLabelError,
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
