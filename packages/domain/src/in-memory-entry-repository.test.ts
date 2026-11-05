import { entryRepositoryContract } from './testing/index.js'
import { inMemoryEntryRepository } from './in-memory-entry-repository.js'

// The fake earns its place by passing the same suite the real store will.
entryRepositoryContract('inMemoryEntryRepository', {
  make: () => inMemoryEntryRepository(),
  // The fake checks no label, so any id is one; the name is a readable id.
  label: async (_repository, name) => name,
  property: async () => {},
})
