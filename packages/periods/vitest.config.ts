import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'periods',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
