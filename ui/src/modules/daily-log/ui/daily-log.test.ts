// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mountDailyLog } from './daily-log.js'
import { testModuleDeps } from '@shared/testing.js'
import type { Entry } from '@dailly/domain'

const entry = (id: string, occurredAt: string, body: string): Entry => ({
  id,
  body,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  labelIds: [],
  props: {},
})

/** Vue renders on the microtask queue; a test has to let it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const mount = (deps = testModuleDeps()) => {
  const host = document.createElement('div')
  document.body.append(host)
  return { host, handle: mountDailyLog(host, deps) }
}

describe('the Daily Log screen', () => {
  it('mounts the whiteboard as an island inside the Vue component', async () => {
    // The seam ADR 0010 chose: a vanilla adapter living inside a Vue tree. If
    // Vue ever renders into that element, these nodes stop appearing.
    const { host } = mount()
    await settle()

    expect(host.querySelector('.whiteboard')).not.toBeNull()
    expect(host.querySelectorAll('.wb-block').length).toBeGreaterThan(0)
  })

  it('always shows which zone is in use', async () => {
    // ADR 0007 requires it on screen, not in Settings.
    const { host } = mount(testModuleDeps({ zone: 'America/Sao_Paulo' }))
    await settle()

    expect(host.querySelector('.daily-log__zone')?.textContent).toContain('America/Sao_Paulo')
  })

  it('says the timeline is empty rather than showing nothing', async () => {
    const { host } = mount()
    await settle()

    expect(host.querySelector('.daily-log__status')?.textContent).toContain('nada por aqui')
  })

  it('renders what the repository already had, grouped by day', async () => {
    const { host } = mount(
      testModuleDeps({
        seed: [
          entry('a', '2026-07-24T10:00:00.000Z', '# um dia de trabalho'),
          entry('b', '2026-07-23T10:00:00.000Z', '# véspera'),
        ],
      }),
    )
    await settle()

    const days = [...host.querySelectorAll('.daily-log__day h2')].map((node) => node.textContent)
    expect(days).toEqual(['24 de julho de 2026', '23 de julho de 2026'])
    expect(host.querySelector('.daily-log__entry')?.textContent?.trim()).toBe('um dia de trabalho')
  })

  it('saves what is in the editor and shows it on the timeline', async () => {
    // The whole vertical slice inside the renderer: whiteboard → toMarkdown →
    // createEntry → repository → queryEntries → grouped timeline.
    const { host } = mount(testModuleDeps({ now: '2026-09-16T12:00:00.000Z' }))
    await settle()

    const save = host.querySelector<HTMLButtonElement>('.daily-log__save')!
    save.click()
    await settle()
    await settle()

    expect(host.querySelector('.daily-log__day h2')?.textContent).toBe('16 de setembro de 2026')
    expect(host.querySelector('.daily-log__entry')?.textContent?.trim()).toBe('Hoje')
  })

  it('shows the error instead of failing silently when the save is refused', async () => {
    const deps = testModuleDeps()
    const { host } = mount({
      ...deps,
      createEntry: () => Promise.reject(new Error('a API local não respondeu')),
    })
    await settle()

    host.querySelector<HTMLButtonElement>('.daily-log__save')!.click()
    await settle()

    expect(host.querySelector('.daily-log__error')?.textContent).toContain('não respondeu')
  })

  it('tears the whiteboard down when the module is destroyed', async () => {
    const { host, handle } = mount()
    await settle()

    handle.destroy()

    expect(host.querySelector('.daily-log')).toBeNull()
  })
})
