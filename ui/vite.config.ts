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
})
