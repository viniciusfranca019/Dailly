import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { alias } from './alias.config.js'

export default defineConfig({
  resolve: { alias },
  plugins: [vue(), tailwind()],
  test: {
    name: 'ui',
    globals: true,
    // Default is node; DOM suites opt in per file with
    // `// @vitest-environment jsdom` so the pure core stays DOM-free.
    environment: 'node',
    // Tests live next to the code they test, so a module carries its own
    // suite: moving or deleting one takes its tests with it.
    include: ['src/**/*.test.ts'],
  },
})
