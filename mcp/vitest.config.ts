import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'mcp',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
