import type { Priority } from '@dailly/tasks-core'

/** What the task panel saves: the form as the person left it (card #22). */
export interface Draft {
  readonly title: string
  readonly statusId: string
  readonly priority: Priority
  readonly body: string
  /** The labels chosen in the panel, saved with the rest (card #46). */
  readonly labelIds: readonly string[]
}
