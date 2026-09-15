import { defineConfig } from 'vite'
import { alias, at } from './alias.config.js'

export default defineConfig({
  root: 'src',
  // The playground is the harness where real browser behaviour of the
  // whiteboard gets checked by eye. The app entry joins it in the next commit.
  // Vite 8 takes entries on the top-level `input`, not `build.rollupOptions`.
  input: {
    playground: at('src/playground/index.html'),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: { alias },
})
