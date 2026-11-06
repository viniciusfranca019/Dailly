import { sequentialIds, type Entry } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'
import type { RequestsPort } from '@shared'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import { testEntryDeps, testRequestsPort, testSharedDeps, testVaultPort } from '@shared/testing.js'
import type { ShellDeps } from './own-deps.js'

/**
 * As deps que um teste do shell entrega: as duas metades, com os use-cases
 * reais sobre store em memória — o único fake fica na borda.
 */
export function testShellDeps(
  options: { seed?: readonly Entry[]; zone?: TimeZone; now?: string; requests?: RequestsPort } = {},
): ShellDeps {
  return {
    shared: testSharedDeps(options),
    own: {
      'daily-log': testEntryDeps(options),
      requests: {
        requests: options.requests ?? testRequestsPort(),
        ids: sequentialIds('request'),
        vault: testVaultPort(),
      },
      tasks: { tasks: tasksOver(inMemoryTaskStore({ newId: sequentialIds('task').next, now: () => options.now ?? '2026-09-16T12:00:00.000Z' })) },
    },
  }
}

/** The screen's port over a store: the calls the board and the list make. */
const tasksOver = (store: ReturnType<typeof inMemoryTaskStore>) => ({
  boards: () => store.boards(),
  createBoard: (input: Parameters<typeof store.createBoard>[0]) => store.createBoard(input),
  updateBoard: (id: string, patch: Parameters<typeof store.updateBoard>[1]) => store.updateBoard(id, patch),
  board: (boardId: string) => store.board(boardId),
  create: (input: Parameters<typeof store.create>[0]) => store.create(input),
  update: (key: Parameters<typeof store.update>[0], patch: Parameters<typeof store.update>[1]) => store.update(key, patch),
  delete: (key: Parameters<typeof store.delete>[0]) => store.delete(key),
  comments: (key: Parameters<typeof store.comments>[0]) => store.comments(key),
  addComment: (key: Parameters<typeof store.addComment>[0], body: string) => store.addComment(key, body),
  deleteComment: async (key: Parameters<typeof store.deleteComment>[0], id: string) =>
    (await store.deleteComment(key, id)) === 'deleted',
})

/** A storage in a Map, so no test sees another test's saved order. */
export const memoryStorage = (seed: Record<string, string> = {}): Storage => {
  const data = new Map(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}
