/// <reference types="vite/client" />

/**
 * Build-time module flags.
 *
 * Compared against a string literal at the use site so vite can fold the branch
 * away; see `src/app/modules.ts` for why the comparison shape matters.
 */
interface ImportMetaEnv {
  readonly VITE_ANALYSE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
