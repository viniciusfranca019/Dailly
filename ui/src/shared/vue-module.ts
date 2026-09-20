/**
 * The contract between the shell and a module.
 *
 * Kept apart from `module.ts` on purpose, and the split has now paid for
 * itself twice. `ModuleDescriptor` survives any UI decision; **this file does
 * not** — it said so while it still described a vanilla `mount(host)` handle,
 * and it was replaced the moment the renderer settled on Vue
 * ([ADR 0010](../../../docs/adrs/0010-vue-no-renderer.md), Emenda 2).
 *
 * A module is now a component, which is what lets the whole app run inside a
 * single Vue application: a plugin installed at the root reaches every module,
 * where one `createApp` per module reached none of them.
 *
 * It lives in `shared/` rather than in `shell/` so that a module never has to
 * import from the composition root; the arrow only points downwards.
 */
import type { Component } from 'vue'

export interface VueModule {
  /**
   * Rendered by the shell into its outlet, with `deps` as its only prop.
   *
   * Named rather than taken from the default export: the module's index stays
   * a `.ts` file re-exporting its component, which is what keeps it visible to
   * the boundary rules in `architecture.test.ts`.
   */
  readonly component: Component
}
