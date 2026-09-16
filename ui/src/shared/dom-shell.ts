/**
 * The contract between the shell and a module.
 *
 * Kept apart from `module.ts` on purpose: `ModuleDescriptor` survives any UI
 * decision, this file does not. §1 of `docs/adaptacao-dailly.md` has since
 * resolved to Vue ([ADR 0010](../../../docs/adrs/0010-vue-no-renderer.md)) —
 * and the shape here survived it: a module is still handed a host element and
 * still returns a handle. What changed is what happens inside, where a module
 * now creates a Vue app on that element instead of appending nodes by hand.
 *
 * It lives in `shared/` rather than in `shell/` so that a module never has to
 * import from the composition root; the arrow only points downwards.
 */
import type { ModuleDeps } from './deps.js'

export interface ModuleHandle {
  destroy(): void
}

export interface MountableModule {
  /**
   * `deps` rather than an import: this is where the composition root's choices
   * enter a module, and the reason a module cannot tell a real store from a
   * fake one.
   */
  mount(host: HTMLElement, deps: ModuleDeps): ModuleHandle
}
