/**
 * Test-only surface, behind its own entry point (`@dailly/domain/testing`) so
 * the production surface never carries a vitest import.
 */
export { entryRepositoryContract } from './entry-repository-contract.js'
export type { ContractOptions } from './entry-repository-contract.js'
