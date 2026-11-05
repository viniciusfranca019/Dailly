// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import {
  createEntry,
  deleteEntry,
  fixedClock,
  inMemoryEntryRepository,
  queryEntries,
  sequentialIds,
  updateEntry,
  type Entry,
  type Label,
  type PropertyDef,
} from '@dailly/domain'
import { testLabelsPort, testPropertiesPort, testSharedDeps } from '@shared/testing.js'
import DailyLog from './DailyLog.vue'

/** Card #36: cutting the timeline by labels (OR) and properties (AND, RN4). */
const NOW = '2026-09-16T12:00:00.000Z'
const work: Label = { id: 'work', name: 'trabalho', color: 'blue' }
const health: Label = { id: 'health', name: 'saúde', color: 'green' }
const humor: PropertyDef = { key: 'humor', type: 'text' }
const entry = (id: string, body: string, hour: string, labelIds: string[], props: Record<string, unknown>): Entry => {
  const at = `2026-09-16T${hour}:00:00.000Z`
  return { id, body, occurredAt: at, createdAt: at, updatedAt: at, labelIds, props }
}
const SEED = [
  entry('a', 'trabalho bom', '11', ['work'], { humor: 'bom' }),
  entry('b', 'saúde ruim', '10', ['health'], { humor: 'ruim' }),
  entry('c', 'saúde bom', '09', ['health'], { humor: 'bom' }),
  entry('d', 'sem label', '08', [], {}),
]

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  document.body.replaceChildren()
})

async function mount() {
  const entries = inMemoryEntryRepository(SEED)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(DailyLog, {
    deps: {
      ...testSharedDeps({ now: NOW }),
      createEntry: createEntry({ entries, clock: fixedClock(NOW), ids: sequentialIds() }),
      queryEntries: queryEntries({ entries }),
      updateEntry: updateEntry({ entries, clock: fixedClock(NOW) }),
      deleteEntry: deleteEntry({ entries }),
      labels: testLabelsPort([work, health]),
      properties: testPropertiesPort([humor]),
    },
  })
  app.mount(host)
  unmount = () => app.unmount()
  await settle()
  return host
}

const at = <T extends HTMLElement = HTMLElement>(host: ParentNode, id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)
const all = (host: ParentNode, id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const titles = (host: HTMLElement) => all(host, 'entry-title').map((el) => el.textContent?.trim())

async function toggle(host: HTMLElement, name: string): Promise<void> {
  all(host, 'filter-label').find((el) => el.textContent?.trim() === name)!.click()
  await settle()
}
async function filterProp(host: HTMLElement, key: string, value: string): Promise<void> {
  const select = at<HTMLSelectElement>(host, 'filter-key')!
  select.value = key
  select.dispatchEvent(new Event('change'))
  const input = at<HTMLInputElement>(host, 'filter-value')!
  input.value = value
  input.dispatchEvent(new Event('input'))
  at<HTMLButtonElement>(host, 'filter-add')!.click()
  await settle()
}

describe('the timeline filter (card #36)', () => {
  it('C1: one label shows only its entries', async () => {
    const host = await mount()
    await toggle(host, 'trabalho')
    expect(titles(host)).toEqual(['trabalho bom'])
    expect(all(host, 'filter-label').find((el) => el.textContent?.trim() === 'trabalho')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('C2: a second label adds up (OR)', async () => {
    const host = await mount()
    await toggle(host, 'trabalho')
    await toggle(host, 'saúde')
    expect(titles(host)).toEqual(['trabalho bom', 'saúde ruim', 'saúde bom'])
  })

  it('C3: a property narrows (AND)', async () => {
    const host = await mount()
    await toggle(host, 'trabalho')
    await toggle(host, 'saúde')
    await filterProp(host, 'humor', 'bom')
    expect(titles(host)).toEqual(['trabalho bom', 'saúde bom'])
    expect(all(host, 'filter-prop-text').map((el) => el.textContent?.trim())).toEqual(['humor = bom'])
  })

  it('C4: clearing brings the whole timeline back', async () => {
    const host = await mount()
    await toggle(host, 'trabalho')
    at<HTMLButtonElement>(host, 'filter-clear')!.click()
    await settle()
    expect(titles(host)).toHaveLength(4)
  })

  it('C5: nothing matches says so, with a way to clear', async () => {
    const host = await mount()
    await toggle(host, 'trabalho')
    await filterProp(host, 'humor', 'ruim')

    expect(titles(host)).toEqual([])
    expect(host.textContent).toContain('nenhum registro com esse filtro')
    at<HTMLButtonElement>(host, 'filter-clear-empty')!.click()
    await settle()
    expect(titles(host)).toHaveLength(4)
  })

  it('a property value outside its type is refused before filtering', async () => {
    const mounted = await mount()
    await filterProp(mounted, 'humor', '   ')
    expect(at(mounted, 'error')?.textContent).toContain('humor precisa de um valor')
    expect(titles(mounted)).toHaveLength(4)
  })
})
