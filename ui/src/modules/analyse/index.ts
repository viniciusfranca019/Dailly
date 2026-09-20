/**
 * Analyse — public surface.
 *
 * Phase 4/5 of the roadmap, and it is gated off by default precisely because it
 * is not built: `VITE_ANALYSE` controls whether it enters the manifest at all,
 * so a build that ships today carries none of this code. The placeholder exists
 * to keep the flag honest — flip it on and the chunk appears, flip it off and
 * it does not.
 */
export { default as component } from './ui/Analyse.vue'
