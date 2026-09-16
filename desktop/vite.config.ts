import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

/**
 * The main process is bundled; the renderer is not the only thing vite builds.
 *
 * The workspace packages are published as TypeScript **source** — that is what
 * keeps `make check` fast and edit-to-test immediate. Node cannot load that,
 * and Electron's main process is Node. So the shell is bundled, which pulls
 * `@dailly/server`, `@dailly/domain` and `@dailly/periods` in as source and
 * emits one JavaScript file.
 *
 * Two things stay outside the bundle: `electron` itself, and `better-sqlite3`,
 * which is a native `.node` binary that no bundler can inline.
 */
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: ['electron', 'better-sqlite3', ...builtinModules.flatMap((id) => [id, `node:${id}`])],
      output: { entryFileNames: 'main.js' },
    },
  },
})
