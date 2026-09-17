import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { alias, at } from './alias.config.js'

export default defineConfig({
  root: 'src',
  // Relative asset paths, because the built app is opened over `file://` by the
  // Electron shell (`loadFile`), not served. With vite's default `base: '/'`,
  // `/assets/app.js` resolves to the filesystem root there — every script 404s
  // and the window renders blank with nothing in the terminal to say why. The
  // dev server is unaffected.
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
      // alike. Here that is proxied to the API running on a fixed port
      // (`make dev-api`); in production the Electron shell hands over a base
      // URL with the ephemeral port instead. One code path, two answers.
      '/api': {
        target: `http://127.0.0.1:${process.env['DAILLY_PORT'] ?? 4317}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
