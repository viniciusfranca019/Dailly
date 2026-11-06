import type { Board } from '@dailly/tasks-core'

const KEY = 'dailly.tasks.board'

/**
 * The last board the person used, remembered in the browser (card #42, C5),
 * under the key F9 and F10 read too. The shape of `useTasksView`: the storage
 * is injectable, and a storage that is missing or throws only means the
 * choice lasts until the reload. An id that no longer exists, or none, opens
 * the first board ("Tasks").
 */
export function useLastBoard(storage: () => Storage | undefined = () => globalThis.localStorage) {
  function pick(boards: readonly Board[]): string | null {
    let saved: string | null = null
    try {
      saved = storage()?.getItem(KEY) ?? null
    } catch {
      saved = null
    }
    return boards.find((board) => board.id === saved)?.id ?? boards[0]?.id ?? null
  }

  function remember(boardId: string): void {
    try {
      storage()?.setItem(KEY, boardId)
    } catch {
      // sem storage, a escolha vale até recarregar
    }
  }

  return { pick, remember }
}
