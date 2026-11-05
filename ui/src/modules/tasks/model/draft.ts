import type { Priority } from '@dailly/tasks-core'

/** What the task panel saves: the form as the person left it (card #22). */
export interface Draft {
  readonly title: string
  readonly statusId: string
  readonly priority: Priority
  readonly body: string
}
