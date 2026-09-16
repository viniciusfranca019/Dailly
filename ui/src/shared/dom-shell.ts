/**
 * The contract of the *current* (vanilla DOM) shell.
 *
 * Kept apart from `module.ts` on purpose: `ModuleDescriptor` survives any UI
 * decision, this file does not. If `docs/adaptacao-dailly.md` §1 resolves to
 * React, this is the file that is replaced — along with each module's `ui/`
 * adapter, and nothing else.
 *
 * It lives in `shared/` rather than in `app/` so that a module never has to
 * import from the composition root; the arrow only points downwards.
 */
export interface ModuleHandle {
  destroy(): void
}

export interface MountableModule {
  mount(host: HTMLElement): ModuleHandle
}
