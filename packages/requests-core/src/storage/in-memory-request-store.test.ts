import { requestStoreContract } from '../testing/index.js'
import { inMemoryRequestStore } from './in-memory-request-store.js'

requestStoreContract('inMemoryRequestStore', { make: inMemoryRequestStore })
