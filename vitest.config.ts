import { defineConfig } from 'vitest/config'

/**
 * The workspace runner: one `vitest run` at the root covers every package.
 *
 * Each project keeps its own config, because they disagree on what they need —
 * `ui` runs jsdom suites, `packages/whiteboard-core` must never see a DOM. The
 * root only says which projects exist.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'server',
      'ui',
      // The rules *between* projects have no project of their own, so they run
      // from the root: no single package can see the arrows it is part of.
      {
        test: {
          name: 'workspace',
          globals: true,
          environment: 'node',
          include: ['architecture.test.ts'],
        },
      },
    ],
  },
})
