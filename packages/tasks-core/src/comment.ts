/**
 * A comment on a task (F7, card #45, J8). Not an Entry (P4 of the PRD): it
 * lives in `task_comments`, goes with its task, and never reaches the Daily
 * Log (RN14). The body is markdown, the format of every Entry body.
 */
export interface TaskComment {
  readonly id: string
  readonly body: string
  readonly createdAt: string
}

export class CommentRequiredError extends Error {
  override readonly name = 'CommentRequiredError'
  constructor() {
    super('o comentário é obrigatório')
  }
}

/**
 * The body as it is stored: trimmed at the ends, and never empty. Blank lines
 * and spaces alone are empty (C2); the screen and the server run the same rule.
 */
export function normalizeCommentBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed === '') throw new CommentRequiredError()
  return trimmed
}
