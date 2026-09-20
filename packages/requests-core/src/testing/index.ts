/**
 * A superfície de teste do pacote — fake e contrato juntos.
 *
 * O fake saiu do índice principal porque o próprio docblock de `index.ts` cita
 * o `@dailly/domain` como precedente, e lá o `inMemoryEntryRepository` mora em
 * `./testing`. Citar um precedente e não segui-lo é pior que não citá-lo.
 */
export { requestStoreContract } from './request-store-contract.js'
export { inMemoryRequestStore } from '../storage/in-memory-request-store.js'
