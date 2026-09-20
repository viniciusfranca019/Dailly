import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'requests-core',
    globals: true,
    // Node, sem escape para jsdom: este pacote não tem DOM para testar — e,
    // mais importante, não tem rede para exercitar.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
