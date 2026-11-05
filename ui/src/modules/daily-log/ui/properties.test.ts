// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
import {
  createEntry,
  deleteEntry,
  fixedClock,
  inMemoryEntryRepository,
  queryEntries,
  sequentialIds,
  updateEntry,
  type Entry,
  type EntryRepository,
  type PropertyDef,
} from '@dailly/domain'
import type { PropertiesPort } from '@shared'
import { testLabelsPort, testPropertiesPort, testSharedDeps } from '@shared/testing.js'
import DailyLog from './DailyLog.vue'

/** Card #35: properties on day logs, typed by a definition born on first use. */
const NOW = '2026-09-16T12:00:00.000Z'
const AT = '2026-09-16T09:00:00.000Z'
const seed = (id: string, body: string, props: Record<string, unknown> = {}): Entry => ({
  id,
  body,
  occurredAt: AT,
  createdAt: AT,
  updatedAt: AT,
  labelIds: [],
  props,
})
const humor: PropertyDef = { key: 'humor', type: 'text' }
const hours: PropertyDef = { key: 'horas', type: 'number' }

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  document.body.replaceChildren()
})

async function mount(entries: EntryRepository, properties: PropertiesPort) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(DailyLog, {
    deps: {
      ...testSharedDeps({ now: NOW }),
      createEntry: createEntry({ entries, clock: fixedClock(NOW), ids: sequentialIds() }),
      queryEntries: queryEntries({ entries }),
      updateEntry: updateEntry({ entries, clock: fixedClock('2026-09-16T15:00:00.000Z') }),
      deleteEntry: deleteEntry({ entries }),
      labels: testLabelsPort(),
      properties,
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
const text = (els: HTMLElement[]) => els.map((el) => el.textContent?.trim())

function type(host: HTMLElement, value: string): void {
  const block = host.querySelector<HTMLElement>(`[data-testid="board"] [${TEXT_ATTR}]`)!
  block.textContent = value
  block.dispatchEvent(new Event('input', { bubbles: true }))
}
function fill(host: HTMLElement, id: string, value: string): void {
  const field = at<HTMLInputElement | HTMLSelectElement>(host, id)!
  field.value = value
  field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input'))
}
async function click(host: ParentNode, id: string): Promise<void> {
  at<HTMLButtonElement>(host, id)!.click()
  await settle()
}
async function addProp(host: HTMLElement, key: string, value: string, kind?: string): Promise<void> {
  fill(host, 'prop-key', key)
  await settle()
  if (kind) {
    fill(host, 'prop-type', kind)
    await settle()
  }
  fill(host, 'prop-value', value)
  await click(host, 'prop-add')
}

describe('C1: adding a property', () => {
  it('shows "humor: bom" on the registered entry', async () => {
    const entries = inMemoryEntryRepository()
    const host = await mount(entries, testPropertiesPort([humor]))
    type(host, 'Dia')
    await settle()

    await addProp(host, 'humor', 'bom')
    await click(host, 'submit')

    expect(text(all(host, 'entry-prop'))).toEqual(['humor: bom'])
    expect((await entries.list({}))[0]?.props).toEqual({ humor: 'bom' })
    expect(all(host, 'chosen-prop')).toEqual([])
  })
})

describe('C2: the key suggests the existing ones', () => {
  it('offers each key with its type', async () => {
    const host = await mount(inMemoryEntryRepository(), testPropertiesPort([humor, hours]))
    const options = [...host.querySelectorAll<HTMLOptionElement>('#daily-log-props option')]
    expect(options.map((option) => option.label)).toEqual(['horas · número', 'humor · texto'])
  })
})

describe('C3: a new key picks its type once (RN3)', () => {
  it('defines "dormiu" as yes/no and shows "dormiu: sim"', async () => {
    const properties = testPropertiesPort()
    const host = await mount(inMemoryEntryRepository(), properties)
    type(host, 'Dia')
    await settle()

    await addProp(host, 'dormiu', 'sim', 'boolean')
    await click(host, 'submit')

    expect(text(all(host, 'entry-prop'))).toEqual(['dormiu: sim'])
    expect(await properties.list()).toEqual([{ key: 'dormiu', type: 'boolean' }])
  })

  it('asks for the type only of a key that has none', async () => {
    const host = await mount(inMemoryEntryRepository(), testPropertiesPort([humor]))
    fill(host, 'prop-key', 'humor')
    await settle()
    expect(at(host, 'prop-type')).toBeNull()
    fill(host, 'prop-key', 'nova')
    await settle()
    expect(at(host, 'prop-type')).not.toBeNull()
  })
})

describe('C4: a value outside the type is refused', () => {
  it('says "horas espera um número" and adds nothing', async () => {
    const host = await mount(inMemoryEntryRepository(), testPropertiesPort([hours]))
    await addProp(host, 'horas', 'abc')
    expect(at(host, 'error')?.textContent).toContain('horas espera um número')
    expect(all(host, 'chosen-prop')).toEqual([])
  })
})

describe('C5: an empty key adds nothing', () => {
  it('ignores a blank key', async () => {
    const properties = testPropertiesPort()
    const host = await mount(inMemoryEntryRepository(), properties)
    await addProp(host, '  ', 'x')
    expect(all(host, 'chosen-prop')).toEqual([])
    expect(await properties.list()).toEqual([])
    expect(at(host, 'error')).toBeNull()
  })
})

describe('C6: taking a property off an entry', () => {
  it('removes it from the entry and keeps the key suggested', async () => {
    const entries = inMemoryEntryRepository([seed('e1', 'Dia', { humor: 'bom' })])
    const host = await mount(entries, testPropertiesPort([humor]))
    at<HTMLButtonElement>(host, 'entry-open')!.click()
    await settle()
    expect(text(all(host, 'chosen-prop-text'))).toEqual(['humor: bom'])

    at(host, 'chosen-prop')!.querySelector('button')!.click()
    await settle()
    await click(host, 'submit')

    expect((await entries.list({}))[0]?.props).toEqual({})
    expect(all(host, 'entry-prop')).toEqual([])
    expect([...host.querySelectorAll<HTMLOptionElement>('#daily-log-props option')].map((o) => o.value)).toEqual(['humor'])
  })
})

describe('C7: a refused write rereads (RN7)', () => {
  it('shows the error and the entry goes back to what the server has', async () => {
    const entries = inMemoryEntryRepository([seed('e1', 'Dia', { humor: 'bom' })])
    const refusing: EntryRepository = {
      ...entries,
      update: async () => {
        throw new Error('humor não tem tipo definido')
      },
    }
    const host = await mount(refusing, testPropertiesPort([humor]))
    at<HTMLButtonElement>(host, 'entry-open')!.click()
    await settle()
    at(host, 'chosen-prop')!.querySelector('button')!.click()
    await settle()

    await click(host, 'submit')

    expect(at(host, 'error')?.textContent).toContain('humor não tem tipo definido')
    expect(text(all(host, 'entry-prop'))).toEqual(['humor: bom'])
  })
})
