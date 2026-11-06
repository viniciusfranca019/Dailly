import { parseKey, type TaskKey } from './task.js'

/**
 * The search of tasks across boards (F9, card #47, J10.2): the exact key when
 * the text has its shape, any case (RN5: a key frozen with an old prefix is
 * still found), plus the tasks whose title contains the text.
 */
export interface TaskSearchResult {
  readonly key: number
  readonly keyPrefix: string
  readonly title: string
  readonly boardId: string
  readonly boardName: string
}

/** At most this many results: the exact key first, then the most recent. */
export const SEARCH_LIMIT = 20

/** The key the text names, case aside; `null` when it is not shaped as one. */
export const searchKey = (text: string): TaskKey | null => parseKey(text.trim().toUpperCase())

/**
 * Folds A–Z only, the way SQLite's `LIKE` does, so the fake finds exactly what
 * the database finds: "CAFÉ" is not "café" in either (the card's Fora de escopo).
 */
const foldAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

/** Whether the title contains the text, literally (`%` and `_` are characters, not wildcards). */
export const matchesTitle = (title: string, text: string): boolean => foldAscii(title).includes(foldAscii(text.trim()))
