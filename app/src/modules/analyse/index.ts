import type { ModuleHandle } from '@shared'

/**
 * Analyse — public surface.
 *
 * Phase 4/5 of the roadmap, and it is gated off by default precisely because it
 * is not built: `VITE_ANALYSE` controls whether it enters the manifest at all,
 * so a build that ships today carries none of this code. The placeholder exists
 * to keep the flag honest — flip it on and the chunk appears, flip it off and
 * it does not.
 */
export function mount(host: HTMLElement): ModuleHandle {
  const section = document.createElement('section')
  section.className = 'analyse'
  section.innerHTML =
    '<h1>Analyse</h1><p>Fase 4/5 do roadmap. Depende de Entry com labels (Fase 2) e do provider BYOK (Fase 3).</p>'
  host.append(section)

  return {
    destroy() {
      section.remove()
    },
  }
}
