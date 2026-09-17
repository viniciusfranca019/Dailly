// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
import type { Entry } from '@dailly/domain'
import { testModuleDeps } from '@shared/testing.js'
import { mountDailyLog } from './daily-log.js'

/**
 * Selectors are `data-testid`, not classes.
 *
 * The markup is Tailwind now, so a class is a styling detail that changes when
 * the design does. A test that asserts on `.rounded-xl` fails on a redesign
 * that broke nothing — and passes a redesign that broke everything, as long as
 * the class survived.
 */

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

const NOW = '2026-09-16T12:00:00.000Z'

const mount = (deps = testModuleDeps({ now: NOW })) => {
  const host = document.createElement('div')
  document.body.append(host)
  return { host, handle: mountDailyLog(host, deps) }
}

const at = <T extends HTMLElement>(host: HTMLElement, id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)
const allAt = (host: HTMLElement, id: string) =>
  [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]

/** Type into the whiteboard the way a person does: text, then the input event. */
function type(host: HTMLElement, value: string): void {
  const block = host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)!
  block.textContent = value
  block.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the composer', () => {
  it('mounts the whiteboard as an island inside the Vue component', async () => {
    // The seam ADR 0010 chose: a vanilla adapter living in a Vue tree. If Vue
    // ever rendered into that element, these nodes would stop appearing.
    const { host } = mount()
    await settle()

    expect(at(host, 'board')).not.toBeNull()
    // One block even though it is empty: the core guarantees a paragraph to put
    // the caret in, so there is always somewhere to type.
    expect(host.querySelectorAll('.wb-block')).toHaveLength(1)
  })

  it('opens empty, with no way to register nothing', async () => {
    const { host } = mount()
    await settle()

    expect(host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)?.textContent).toBe('')
    expect(at<HTMLButtonElement>(host, 'submit')?.disabled).toBe(true)
  })

  it('offers to register as soon as there is something to register', async () => {
    const { host } = mount()
    await settle()

    type(host, 'uma coisa que aconteceu')
    await settle()

    expect(at<HTMLButtonElement>(host, 'submit')?.disabled).toBe(false)
  })

  it('titles the card with today, in the configured zone', async () => {
    const { host } = mount(testModuleDeps({ now: '2026-09-17T02:00:00.000Z', zone: 'America/Sao_Paulo' }))
    await settle()

    // 02:00Z on the 17th is still the 16th in São Paulo — the card must say the
    // day the person is living, like everything else on this screen.
    expect(at(host, 'composer')?.textContent).toContain('16 de setembro de 2026')
  })

  it('offers only the block types the model has', async () => {
    // No B / I / U: a block is a type and a line of text, so those buttons
    // could only be decoration. Inline marks are a model change, not a button.
    const { host } = mount()
    await settle()

    expect(allAt(host, 'tool').map((tool) => tool.textContent?.trim())).toEqual([
      'H1',
      'H2',
      '•',
      '1.',
      '☐',
    ])
  })

  it('turns the current block into a heading from the toolbar', async () => {
    // Through the same `transform` the typed `# ` shortcut uses: one syntax
    // table, two ways in.
    const { host } = mount()
    await settle()
    type(host, 'virou título')
    await settle()

    allAt(host, 'tool')[0]!.click()
    await settle()

    expect(host.querySelector('.wb-block--heading')).not.toBeNull()
  })

  it('Cancelar empties the composer without writing anything', async () => {
    const deps = testModuleDeps({ now: NOW })
    const { host } = mount(deps)
    await settle()
    type(host, 'escrito por engano')
    await settle()

    at<HTMLButtonElement>(host, 'cancel')!.click()
    await settle()

    expect(host.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)?.textContent).toBe('')
    expect(await deps.queryEntries()).toEqual([])
  })
})

describe('the timeline', () => {
  it('says it is empty rather than showing nothing', async () => {
    const { host } = mount()
    await settle()

    expect(at(host, 'timeline-status')?.textContent).toContain('nada por aqui')
  })

  it('groups entries by day, newest first, and names today', async () => {
    const { host } = mount(
      testModuleDeps({
        now: NOW,
        seed: [
          entry('a', '2026-09-16T10:00:00.000Z', '# um dia de trabalho'),
          entry('b', '2026-09-15T10:00:00.000Z', '# véspera'),
          entry('c', '2026-09-01T10:00:00.000Z', '# faz tempo'),
        ],
      }),
    )
    await settle()

    expect(allAt(host, 'day-heading').map((node) => node.textContent?.trim())).toEqual([
      'Hoje, 16 de setembro de 2026',
      'Ontem, 15 de setembro de 2026',
      '1 de setembro de 2026',
    ])
  })

  it('shows the time each entry happened, in the configured zone', async () => {
    const { host } = mount(
      testModuleDeps({
        now: NOW,
        zone: 'America/Sao_Paulo',
        seed: [entry('a', '2026-09-17T01:00:00.000Z', '# tarde da noite')],
      }),
    )
    await settle()

    // 01:00Z is 22:00 the previous evening in São Paulo. A UTC label here would
    // put "01:00" under a heading for the day before — the timezone bug in
    // disguise.
    expect(at(host, 'entry-time')?.textContent?.trim()).toBe('22:00')
  })

  it('registers what was typed and puts it at the top', async () => {
    const { host } = mount()
    await settle()

    type(host, '# terminei o redesign')
    await settle()
    at<HTMLButtonElement>(host, 'submit')!.click()
    await settle()
    await settle()

    expect(at(host, 'day-heading')?.textContent).toContain('Hoje')
    expect(at(host, 'entry-title')?.textContent?.trim()).toBe('terminei o redesign')
  })

  it('narrows the list as you search, and says when nothing matches', async () => {
    const { host } = mount(
      testModuleDeps({
        now: NOW,
        seed: [
          entry('a', '2026-09-16T10:00:00.000Z', '# deploy de testes'),
          entry('b', '2026-09-16T09:00:00.000Z', '# reunião de alinhamento'),
        ],
      }),
    )
    await settle()
    const search = at<HTMLInputElement>(host, 'search')!

    search.value = 'deploy'
    search.dispatchEvent(new Event('input'))
    await settle()

    expect(allAt(host, 'entry-title').map((node) => node.textContent?.trim())).toEqual([
      'deploy de testes',
    ])

    search.value = 'nada com esse nome'
    search.dispatchEvent(new Event('input'))
    await settle()

    expect(at(host, 'timeline-status')?.textContent).toContain('nada encontrado')
  })

  it('shows no tag row while labels do not exist yet', async () => {
    // Fase 2 owns labels. Seeding fake ones would make a screenshot that
    // promises something the product cannot do.
    const { host } = mount(
      testModuleDeps({ now: NOW, seed: [entry('a', '2026-09-16T10:00:00.000Z', '# sem tags')] }),
    )
    await settle()

    expect(at(host, 'entry')?.querySelector('ul')).toBeNull()
  })

  it('shows the error instead of failing silently when registering is refused', async () => {
    const deps = testModuleDeps({ now: NOW })
    const { host } = mount({
      ...deps,
      createEntry: () => Promise.reject(new Error('a API local não respondeu')),
    })
    await settle()
    type(host, 'algo que não vai ser salvo')
    await settle()

    at<HTMLButtonElement>(host, 'submit')!.click()
    await settle()

    expect(at(host, 'error')?.textContent).toContain('não respondeu')
  })

  it('tears the whiteboard down when the module is destroyed', async () => {
    const { host, handle } = mount()
    await settle()

    handle.destroy()

    expect(at(host, 'daily-log')).toBeNull()
  })
})
