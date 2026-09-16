// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
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

/**
 * Type into the whiteboard the way a person does — text into the block, then
 * the input event the adapter listens for. There is no other way in, and that
 * is the point: the test drives the island through the same surface the user
 * touches.
 */
function type(host: HTMLElement, value: string): void {
  const block = host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)!
  block.textContent = value
  block.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the Daily Log screen', () => {
  it('mounts the whiteboard as an island inside the Vue component', async () => {
    // The seam ADR 0010 chose: a vanilla adapter living inside a Vue tree. If
    // Vue ever renders into that element, these nodes stop appearing.
    const { host } = mount()
    await settle()

    expect(host.querySelector('.whiteboard')).not.toBeNull()
    // One block even though the composer is empty: the core guarantees a
    // paragraph to put the caret in, so there is always somewhere to type.
    expect(host.querySelectorAll('.wb-block').length).toBe(1)
  })

  it('opens with an empty composer and no way to save nothing', async () => {
    // It used to open with a sample entry, and clicking save without typing
    // would have persisted a diary entry the person never wrote.
    const { host } = mount()
    await settle()

    expect(host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)?.textContent).toBe('')
    expect(host.querySelector<HTMLButtonElement>('.daily-log__save')?.disabled).toBe(true)
  })

  it('offers to save as soon as there is something to save', async () => {
    const { host } = mount()
    await settle()

    type(host, 'uma coisa que aconteceu')
    await settle()

    expect(host.querySelector<HTMLButtonElement>('.daily-log__save')?.disabled).toBe(false)
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

  it('saves what was typed and shows it on the timeline', async () => {
    // The whole vertical slice inside the renderer: typing → toMarkdown →
    // createEntry → repository → queryEntries → grouped timeline.
    const { host } = mount(testModuleDeps({ now: '2026-09-16T12:00:00.000Z' }))
    await settle()

    type(host, '# terminei a Fase 1')
    await settle()
    host.querySelector<HTMLButtonElement>('.daily-log__save')!.click()
    await settle()
    await settle()

    expect(host.querySelector('.daily-log__day h2')?.textContent).toBe('16 de setembro de 2026')
    expect(host.querySelector('.daily-log__entry')?.textContent?.trim()).toBe('terminei a Fase 1')
  })

  it('empties the composer after saving, and leaves it usable for the next entry', async () => {
    // The second save is where this breaks if clearing goes through the DOM
    // instead of the document: no block, nothing to type into, and the person
    // has to restart the app to write again.
    const { host } = mount()
    await settle()

    type(host, 'primeira entrada')
    await settle()
    host.querySelector<HTMLButtonElement>('.daily-log__save')!.click()
    await settle()
    await settle()

    expect(host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)?.textContent).toBe('')
    expect(host.querySelector<HTMLButtonElement>('.daily-log__save')?.disabled).toBe(true)

    type(host, 'segunda entrada')
    await settle()
    host.querySelector<HTMLButtonElement>('.daily-log__save')!.click()
    await settle()
    await settle()

    const titles = [...host.querySelectorAll('.daily-log__entry')].map((node) =>
      node.textContent?.trim(),
    )
    expect(titles).toEqual(['segunda entrada', 'primeira entrada'])
  })

  it('shows the error instead of failing silently when the save is refused', async () => {
    const deps = testModuleDeps()
    const { host } = mount({
      ...deps,
      createEntry: () => Promise.reject(new Error('a API local não respondeu')),
    })
    await settle()

    type(host, 'algo que não vai ser salvo')
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
