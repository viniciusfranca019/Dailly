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

/** The screen's port over a store: the two calls the list makes. */
const tasksOver = (store: ReturnType<typeof inMemoryTaskStore>) => ({
  board: () => store.board(),
  create: (input: Parameters<typeof store.create>[0]) => store.create(input),
})
