import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'tasks-core',
    globals: true,
    // Node, sem jsdom: o modelo do Tasks não tem tela nem rede.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
