import type { ModuleDescriptor, VueModule } from '@shared'

/**
 * The manifest — the single place that knows which modules exist in a build.
 *
 * **Why the flag is shaped like this.** Vite only folds a *static literal
 * comparison*; `VITE_MODULES.includes('analyse')` is a runtime string op and
 * survives into the bundle. So the flag is `=== 'true'`, and the whole
 * descriptor — `import()` included — sits inside the branch that folds. With
 * the flag off, nothing references `@modules/analyse` and no chunk is emitted.
 *
 * Trade-off, stated once: build-time flags *remove* code, which is what we want
 * while Analyse is still Phase 4/5 of the roadmap and must not ship half-built.
 * A runtime flag would let one build toggle without rebuilding, at the cost of
 * carrying every module in every bundle. Revisit if that day comes.
 */
export const MODULES: readonly ModuleDescriptor<VueModule>[] = [
  {
    id: 'daily-log',
    title: 'Daily Log',
    route: '/',
    load: () => import('@modules/daily-log'),
  },
  ...(import.meta.env.VITE_ANALYSE === 'true'
    ? [
        {
          id: 'analyse',
          title: 'Analyse',
          route: '/analyse',
          load: () => import('@modules/analyse'),
        },
      ]
    : []),
  ...(import.meta.env.VITE_REQUESTS === 'true'
    ? [
        {
          id: 'requests',
          title: 'Requests',
          route: '/requests',
          load: () => import('@modules/requests'),
        },
      ]
    : []),
]
