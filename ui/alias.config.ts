import { fileURLToPath } from 'node:url'

/** Resolve a path relative to the `ui/` root. */
export const at = (path: string) => fileURLToPath(new URL(`./${path}`, import.meta.url))

/**
 * Import boundaries, declared once and shared by vite and vitest.
 *
 * `@capabilities` and `@modules` are prefixes on purpose: a new capability or
 * module needs no entry here, and every import says out loud which layer it is
 * crossing into.
 */
export const alias = [
  { find: '@capabilities', replacement: at('src/capabilities') },
  { find: '@modules', replacement: at('src/modules') },
  { find: '@shared', replacement: at('src/shared') },
]
