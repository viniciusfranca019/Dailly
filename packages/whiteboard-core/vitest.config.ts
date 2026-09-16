import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'whiteboard-core',
    globals: true,
    // Node, with no jsdom escape hatch: this package has no DOM to test.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
