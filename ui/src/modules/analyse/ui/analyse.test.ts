// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { component as Analyse } from '@modules/analyse'
import { testModuleDeps } from '@shared/testing.js'

const mount = () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(Analyse, { deps: testModuleDeps() })
  app.mount(host)
  return { host, destroy: () => app.unmount() }
}

/**
 * The placeholder keeps the flag honest.
 *
 * `VITE_ANALYSE` decides whether this module enters the manifest at all, and a
 * flag nobody can see the effect of stops being checked. So the screen behind
 * it has to say what it is — unbuilt, and why — rather than render an empty
 * panel that looks like a bug.
 */
describe('C5: Analyse is a component, and still says it is not ready', () => {
  it('names itself with a heading, so the outlet is never an anonymous panel', () => {
    const { host } = mount()

    const heading = host.querySelector('h1')
    expect(heading?.textContent).toBe('Analyse')
  })

  it('states the roadmap phase it belongs to', () => {
    const { host } = mount()

    expect(host.textContent).toContain('Fase 4/5')
  })

  it('names what it is waiting on, rather than promising a feature', () => {
    // The two are real dependencies from the roadmap: labels on Entry land in
    // Phase 2 and the BYOK provider in Phase 3. Naming them is what makes this
    // screen an explanation instead of a dead end.
    const { host } = mount()

    expect(host.textContent).toContain('Fase 2')
    expect(host.textContent).toContain('Fase 3')
    // Nothing here may look operable: a disabled-looking control invites a
    // click and a bug report.
    expect(host.querySelectorAll('button, input, a[href]')).toHaveLength(0)
  })

  it('leaves the host empty when the shell tears it down', () => {
    const { host, destroy } = mount()
    destroy()

    expect(host.children.length).toBe(0)
  })
})
