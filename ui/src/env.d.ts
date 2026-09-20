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
 * **This is a stand-in, and the gap is wider than this file used to claim.**
 * The real tool is `vue-tsc`, which typechecks the template itself — props,
 * slots, the lot. It does not run here yet: vue-tsc 3.3 loads
 * `typescript/lib/tsc`, and TypeScript 7 (the native port) no longer exports
 * that path.
 *
 * This docblock used to say the template was unchecked "and the `<script
 * setup>` half is checked normally". **That was false**, and the correction
 * matters because it was being read as a guarantee. `tsc` does not parse
 * `.vue` at all — the shim below resolves the whole file, script included, to
 * an opaque `DefineComponent`. Verified by putting
 * `const zzz: number = 'definitely not a number'` inside a `<script setup
 * lang="ts">` block: `tsc --noEmit` exits 0.
 *
 * What this means in practice: **no line of any SFC is typechecked**, template
 * or script, and the props a component declares are enforced by tests alone.
 * It is why `daily-log.test.ts` asserts on rendered text rather than on
 * internals, and why the shell's props seam has its own tests rather than
 * trusting the compiler. Getting `vue-tsc` running is an open pendency of
 * [ADR 0010](../../docs/adrs/0010-vue-no-renderer.md).
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
