/// <reference types="vite/client" />

/**
 * Build-time module flags.
 *
 * Compared against a string literal at the use site so vite can fold the branch
 * away; see `src/shell/modules.ts` for why the comparison shape matters.
 */
interface ImportMetaEnv {
  readonly VITE_ANALYSE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Single-file components, as far as `tsc` is concerned.
 *
 * **This is a stand-in, and the gap is worth stating.** The real tool is
 * `vue-tsc`, which typechecks the template itself — props, slots, the lot. It
 * does not run here yet: vue-tsc 3.3 loads `typescript/lib/tsc`, and
 * TypeScript 7 (the native port) no longer exports that path. So templates are
 * checked by nobody until vue-tsc catches up, and the `<script setup>` half is
 * checked normally.
 *
 * What this means in practice: a typo in a template is caught by a test, not by
 * the compiler — which is part of why `daily-log.test.ts` asserts on rendered
 * text rather than on internals.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
