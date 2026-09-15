/**
 * The module contract — deliberately neutral about rendering.
 *
 * It says how a module is *identified and loaded*, never how it is drawn. The
 * choice of React vs. vanilla (`docs/adaptacao-dailly.md` §1) is still open, so
 * the descriptor is generic over whatever surface the shell of the day needs:
 * swapping the shell does not touch the manifest or the flag mechanism.
 */
export interface ModuleDescriptor<TModule> {
  /** Stable identity, used in flags and diagnostics. */
  readonly id: string
  /** What the shell shows in the navigation. */
  readonly title: string
  /** Where the shell routes it. */
  readonly route: string
  /**
   * Lazy entry point. Dynamic on purpose: a module left out of the manifest by
   * a build flag has no reachable `import()`, so its chunk is never emitted.
   */
  load(): Promise<TModule>
}

export class ManifestError extends Error {}

/**
 * Fail loudly at boot instead of silently shadowing a module. A duplicate id or
 * route is always a composition bug, and the flags make it easy to introduce.
 */
export function assertManifest(modules: readonly ModuleDescriptor<unknown>[]): void {
  if (modules.length === 0) {
    throw new ManifestError('empty manifest: every build needs at least one module enabled')
  }
  for (const key of ['id', 'route'] as const) {
    const seen = new Set<string>()
    for (const module of modules) {
      const value = module[key]
      if (seen.has(value)) throw new ManifestError(`duplicate module ${key}: ${value}`)
      seen.add(value)
    }
  }
}

/** The module owning a route, or `undefined` — the shell decides the fallback. */
export function findByRoute<T>(
  modules: readonly ModuleDescriptor<T>[],
  route: string,
): ModuleDescriptor<T> | undefined {
  return modules.find((module) => module.route === route)
}
