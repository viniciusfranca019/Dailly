import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { alias, at } from './alias.config.js'

export default defineConfig({
  root: 'src',
  // Relative asset paths. They were needed when the Electron shell opened the
  // build over `file://`; since ADR 0012 the build is served (`vite preview`),
  // where they still work, and they keep the `dist/` openable from any path.
  base: './',
  // Two pages: the app is the product, the playground is the harness where
  // real browser behaviour of the whiteboard gets checked by eye (the README
  // points `make dev` at it, so it does not get folded into the app).
  // Vite 8 takes entries on the top-level `input`, not `build.rollupOptions`.
  input: {
    app: at('src/index.html'),
    playground: at('src/playground/index.html'),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: { alias },
  plugins: [vue(), tailwind()],
  server: {
    proxy: {
      // The renderer only ever fetches `/api/...`, in dev and in production
      // alike, proxied to the API on its fixed port (`DAILLY_PORT`). `vite
      // preview` (`make start`) inherits this proxy, so it is one answer for both
      // since ADR 0012.
      '/api': {
        target: `http://127.0.0.1:${process.env['DAILLY_PORT'] ?? 4317}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
