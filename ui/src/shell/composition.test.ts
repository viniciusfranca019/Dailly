// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MODULES } from './modules.js'
import { mountShell } from './mount.js'
import { testModuleDeps } from '@shared/testing.js'
import { assertManifest } from '@shared'

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})

/**
 * The other app suites run on fakes, and the architecture suite only reads
 * text — both would stay green if the real `daily-log` threw on mount. This is
 * the one that boots what actually ships.
 */
describe('the real composition', () => {
  it('ships a valid manifest', () => {
    expect(() => assertManifest(MODULES)).not.toThrow()
  })

  it('has exactly the modules the flags asked for', () => {
    /**
     * Proves the flag reaches the manifest, in whichever mode the suite is run.
     *
     * `make test` runs with Analyse off and `make test-all` with it on, and the
     * difference has to be observable from inside — otherwise `test-all` is a
     * target that passes for two reasons and tells them apart for neither:
     * because the flag worked, or because it never arrived and both runs were
     * the same run.
     */
    const withAnalyse = import.meta.env.VITE_ANALYSE === 'true'
    expect(MODULES.map((module) => module.id)).toEqual(
      withAnalyse ? ['daily-log', 'analyse'] : ['daily-log'],
    )
  })

  it('always has Daily Log, whatever the flags say', () => {
    // Flags may remove modules; removing this one would leave an empty product.
    expect(MODULES.map((module) => module.id)).toContain('daily-log')
  })

  it('boots Daily Log with a live whiteboard inside it', async () => {
    await mountShell(host, { modules: MODULES, deps: testModuleDeps() })

    expect(host.querySelector('[data-testid="daily-log"]')).not.toBeNull()
    // Rendered blocks, not just a container: this is the seam between the
    // product module and the capability actually carrying traffic. The composer
    // opens empty, so what proves the whiteboard is live is the one paragraph
    // the core guarantees — rendered, and editable.
    expect(host.querySelectorAll('.wb-block').length).toBe(1)
    expect(host.querySelector('.wb-text')?.textContent).toBe('')
    expect(host.querySelector('.wb-text')?.getAttribute('contenteditable')).not.toBeNull()
  })

  it('keeps the zone on screen, where ADR 0007 says it has to be', async () => {
    // Not in Settings, not on hover: every date the app shows is derived from
    // it, so hiding it hides the reason a day looks the way it does.
    await mountShell(host, {
      modules: MODULES,
      deps: testModuleDeps({ zone: 'America/Sao_Paulo' }),
    })

    expect(host.querySelector('[data-testid="zone"]')?.textContent).toContain('America/Sao_Paulo')
  })

  it('every module in the manifest mounts and unmounts without throwing', async () => {
    const shell = await mountShell(host, { modules: MODULES, deps: testModuleDeps() })

    for (const module of MODULES) {
      await shell.go(module.route)
      expect(shell.current).toBe(module.route)

      /**
       * The route moving is no longer evidence that the module works.
       *
       * On `origin/main` a module that could not load rejected out of `go()`
       * and this loop went red. `go()` now catches that and renders an error
       * instead — which is the right behaviour for a user and the wrong
       * behaviour for this assertion, because `current` advances either way.
       * So the test has to look at the screen, which is the same distinction
       * `mount.ts` draws: `current` is where you are, not what loaded.
       *
       * Without these two lines a module that throws at import time leaves the
       * whole suite green — verified by breaking `modules/analyse/index.ts` on
       * purpose.
       */
      expect(host.querySelector('[role="alert"]')).toBeNull()
      expect(host.querySelector('[data-testid="outlet"]')?.children.length).toBeGreaterThan(0)
    }

    shell.destroy()
    expect(host.children.length).toBe(0)
  })
})
