import { entryRepositoryContract } from './testing/index.js'
import { inMemoryEntryRepository } from './in-memory-entry-repository.js'

// The fake earns its place by passing the same suite the real store will.
entryRepositoryContract('inMemoryEntryRepository', { make: () => inMemoryEntryRepository() })
