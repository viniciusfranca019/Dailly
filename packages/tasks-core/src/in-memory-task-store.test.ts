import { inMemoryTaskStore } from './in-memory-task-store.js'
import { taskStoreContract } from './testing/task-store-contract.js'

let n = 0
taskStoreContract('in-memory', {
  make: () =>
    inMemoryTaskStore({
      newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
      now: () => '2026-11-05T12:00:00.000Z',
    }),
})
