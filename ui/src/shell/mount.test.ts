// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountShell } from './mount.js'
import { testModuleDeps } from '@shared/testing.js'
import type { ModuleDescriptor, MountableModule } from '@shared'

let host: HTMLElement

const fakeModule = (marker: string) => {
  const destroy = vi.fn()
  const module: MountableModule = {
    mount(target: HTMLElement) {
      const node = document.createElement('p')
      node.dataset['marker'] = marker
      target.append(node)
      return { destroy }
    },
  }
  return { module, destroy }
}

const descriptorFor = (id: string, route: string, module: MountableModule) => {
  const load = vi.fn(() => Promise.resolve(module))
  const descriptor: ModuleDescriptor<MountableModule> = { id, title: id, route, load }
  return { descriptor, load }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})

describe('mountShell', () => {
  it('mounts the first module of the manifest on boot', async () => {
    const first = fakeModule('daily-log')
    const { descriptor } = descriptorFor('daily-log', '/', first.module)

    const shell = await mountShell(host, { modules: [descriptor], deps: testModuleDeps() })

    expect(shell.current).toBe('/')
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })

  it('loads a module only when it is visited', async () => {
    // This is the whole point of the lazy `load`: a module that is in the
    // manifest but never opened costs nothing at boot, and one that is flagged
    // out of the manifest is never referenced at all.
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })

    expect(a.load).toHaveBeenCalledTimes(1)
    expect(b.load).not.toHaveBeenCalled()

    await shell.go('/analyse')
    expect(b.load).toHaveBeenCalledTimes(1)
  })

  it('destroys the outgoing module before mounting the next', async () => {
    const first = fakeModule('daily-log')
    const second = fakeModule('analyse')
    const a = descriptorFor('daily-log', '/', first.module)
    const b = descriptorFor('analyse', '/analyse', second.module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })
    await shell.go('/analyse')

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-marker="daily-log"]')).toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).not.toBeNull()
  })

  it('ignores a route no module claims, instead of blanking the screen', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const shell = await mountShell(host, { modules: [a.descriptor], deps: testModuleDeps() })

    await shell.go('/analyse')

    expect(shell.current).toBe('/')
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })

  it('renders one nav button per enabled module', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })

    const routes = [...host.querySelectorAll('[data-testid="nav"] button')].map(
      (button) => (button as HTMLElement).dataset['route'],
    )
    expect(routes).toEqual(['/', '/analyse'])
  })
})
