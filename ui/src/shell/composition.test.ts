// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MODULES } from './modules.js'
import { mountShell } from './mount.js'
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

  it('always has Daily Log, whatever the flags say', () => {
    // Flags may remove modules; removing this one would leave an empty product.
    expect(MODULES.map((module) => module.id)).toContain('daily-log')
  })

  it('boots Daily Log with a live whiteboard inside it', async () => {
    await mountShell(host, { modules: MODULES })

    expect(host.querySelector('.daily-log')).not.toBeNull()
    // Rendered blocks, not just a container: this is the seam between the
    // product module and the capability actually carrying traffic.
    expect(host.querySelectorAll('.wb-block').length).toBeGreaterThan(0)
    expect(host.querySelector('.wb-text')?.textContent).toBe('Hoje')
  })

  it('every module in the manifest mounts and unmounts without throwing', async () => {
    const shell = await mountShell(host, { modules: MODULES })

    for (const module of MODULES) {
      await shell.go(module.route)
      expect(shell.current).toBe(module.route)
    }

    shell.destroy()
    expect(host.children.length).toBe(0)
  })
})
