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
  type Label,
} from '@dailly/domain'
import type { LabelsPort } from '@shared'
import { testLabelsPort, testSharedDeps } from '@shared/testing.js'
import DailyLog from './DailyLog.vue'

/**
 * Card #34: labels on day logs, applied in the composer and the correction,
 * and managed (rename, recolor, delete) from the Daily Log.
 *
 * The in-memory entry store does not know labels exist; deleting one is
 * mirrored by hand where the scenario needs it (C8), as the cascade does in
 * SQLite.
 */
const NOW = '2026-09-16T12:00:00.000Z'
const AT = '2026-09-16T09:00:00.000Z'

const seed = (id: string, body: string, labelIds: string[] = []): Entry => ({
  id,
  body,
  occurredAt: AT,
  createdAt: AT,
  updatedAt: AT,
  labelIds,
  props: {},
})
const work: Label = { id: 'work', name: 'trabalho', color: 'blue' }
const health: Label = { id: 'health', name: 'saúde', color: 'green' }

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  document.body.replaceChildren()
})

async function mount(entries: EntryRepository, labels: LabelsPort) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(DailyLog, {
    deps: {
      ...testSharedDeps({ now: NOW }),
      createEntry: createEntry({ entries, clock: fixedClock(NOW), ids: sequentialIds() }),
      queryEntries: queryEntries({ entries }),
      updateEntry: updateEntry({ entries, clock: fixedClock('2026-09-16T15:00:00.000Z') }),
      deleteEntry: deleteEntry({ entries }),
      labels,
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

async function addLabel(host: HTMLElement, name: string): Promise<void> {
  const input = at<HTMLInputElement>(host, 'label-input')!
  input.value = name
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await settle()
}

async function click(host: ParentNode, id: string): Promise<void> {
  at<HTMLButtonElement>(host, id)!.click()
  await settle()
}

const entryLabels = (host: HTMLElement) => text(all(host, 'entry-label'))

describe('C1: applying an existing label', () => {
  it('shows the label, in its color, on the registered entry', async () => {
    const entries = inMemoryEntryRepository()
    const host = await mount(entries, testLabelsPort([work]))

    type(host, 'Reunião')
    await settle()
    await addLabel(host, 'trabalho')
    await click(host, 'submit')

    expect(entryLabels(host)).toEqual(['trabalho'])
    expect(at(host, 'entry-label')!.dataset.color).toBe('blue')
    expect((await entries.list({}))[0]?.labelIds).toEqual(['work'])
    // The picker empties with the board, ready for the next entry.
    expect(all(host, 'chosen-label')).toEqual([])
  })

  it('applies a label while correcting an entry', async () => {
    const entries = inMemoryEntryRepository([seed('e1', 'Reunião')])
    const host = await mount(entries, testLabelsPort([work]))
    at<HTMLButtonElement>(host, 'entry-open')!.click()
    await settle()

    await addLabel(host, 'trabalho')
    await click(host, 'submit')

    expect((await entries.list({}))[0]?.labelIds).toEqual(['work'])
  })
})

describe('C2: creating a label by typing', () => {
  it('creates it with a palette color and applies it', async () => {
    const labels = testLabelsPort([work])
    const host = await mount(inMemoryEntryRepository(), labels)

    await addLabel(host, 'casa')

    const created = (await labels.list()).find((label) => label.name === 'casa')
    expect(created?.color).toBe('green')
    expect(text(all(host, 'chosen-label-name'))).toEqual(['casa'])
  })
})

describe('C3: an empty name creates nothing', () => {
  it('ignores a blank name', async () => {
    const labels = testLabelsPort()
    const host = await mount(inMemoryEntryRepository(), labels)
    await addLabel(host, '   ')
    expect(await labels.list()).toEqual([])
    expect(all(host, 'chosen-label')).toEqual([])
  })
})

describe('C4: the same name in another case uses the existing one (RN1)', () => {
  it('applies "Trabalho" when "trabalho" is typed, creating nothing', async () => {
    const labels = testLabelsPort([{ ...work, name: 'Trabalho' }])
    const host = await mount(inMemoryEntryRepository(), labels)
    await addLabel(host, 'trabalho')
    expect(text(all(host, 'chosen-label-name'))).toEqual(['Trabalho'])
    expect(await labels.list()).toHaveLength(1)
  })
})

describe('C5: taking a label off an entry', () => {
  it('removes it from the entry and keeps the label', async () => {
    const entries = inMemoryEntryRepository([seed('e1', 'Reunião', ['work'])])
    const labels = testLabelsPort([work])
    const host = await mount(entries, labels)
    at<HTMLButtonElement>(host, 'entry-open')!.click()
    await settle()

    at<HTMLButtonElement>(host, 'chosen-label')!.querySelector('button')!.click()
    await settle()
    await click(host, 'submit')

    expect((await entries.list({}))[0]?.labelIds).toEqual([])
    expect(entryLabels(host)).toEqual([])
    expect(await labels.list()).toEqual([work])
  })
})

describe('C6, C7: renaming and recoloring', () => {
  it('C6: every entry with the label shows the new name and color', async () => {
    const entries = inMemoryEntryRepository([seed('e1', 'a', ['work']), seed('e2', 'b', ['work'])])
    const host = await mount(entries, testLabelsPort([work]))

    const name = at<HTMLInputElement>(host, 'label-name')!
    name.value = 'job'
    name.dispatchEvent(new Event('change'))
    await settle()
    const color = at<HTMLSelectElement>(host, 'label-color')!
    color.value = 'green'
    color.dispatchEvent(new Event('change'))
    await settle()

    expect(entryLabels(host)).toEqual(['job', 'job'])
    expect(all(host, 'entry-label').map((el) => el.dataset.color)).toEqual(['green', 'green'])
  })

  it('C7: an empty or taken name is refused with the reason, and the label stays', async () => {
    const host = await mount(inMemoryEntryRepository(), testLabelsPort([{ ...work, name: 'job' }, health]))
    const row = all(host, 'label-row').find((el) => (at<HTMLInputElement>(el, 'label-name')!.value) === 'job')!
    const name = at<HTMLInputElement>(row, 'label-name')!

    name.value = 'Saúde'
    name.dispatchEvent(new Event('change'))
    await settle()

    expect(at(host, 'error')?.textContent).toContain('já existe uma label com esse nome')
    const reread = all(host, 'label-row').map((el) => at<HTMLInputElement>(el, 'label-name')!.value)
    expect(reread).toContain('job')

    const again = all(host, 'label-row').find((el) => at<HTMLInputElement>(el, 'label-name')!.value === 'job')!
    const field = at<HTMLInputElement>(again, 'label-name')!
    field.value = '  '
    field.dispatchEvent(new Event('change'))
    await settle()
    expect(at(host, 'error')?.textContent).toContain('o nome da label é obrigatório')
  })
})

describe('C8, C9: deleting a label', () => {
  it('C8: removes it from every entry and keeps the entries (RN2)', async () => {
    const stored = inMemoryEntryRepository([seed('e1', 'a', ['work']), seed('e2', 'b', ['work'])])
    // The SQLite cascade, mirrored: deleting a label takes it off the entries.
    const labels = testLabelsPort([work])
    const cascading: LabelsPort = {
      ...labels,
      delete: async (id) => {
        for (const entry of await stored.list({})) {
          await stored.update(entry.id, { labelIds: entry.labelIds.filter((x) => x !== id), updatedAt: NOW })
        }
        return labels.delete(id)
      },
    }
    const host = await mount(stored, cascading)

    await click(host, 'label-delete')
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull()
    await click(host, 'confirm-label-delete')

    expect(entryLabels(host)).toEqual([])
    expect(all(host, 'entry-title')).toHaveLength(2)
    expect(await labels.list()).toEqual([])
  })

  it('C9: cancelling changes nothing', async () => {
    const labels = testLabelsPort([work])
    const host = await mount(inMemoryEntryRepository([seed('e1', 'a', ['work'])]), labels)

    await click(host, 'label-delete')
    await click(host, 'keep-label')

    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(await labels.list()).toEqual([work])
    expect(entryLabels(host)).toEqual(['trabalho'])
  })
})

describe('C10: a refused write rereads (RN7)', () => {
  it('shows the error and the label list goes back to what the server has', async () => {
    const labels = testLabelsPort([work])
    const refusing: LabelsPort = {
      ...labels,
      create: async () => {
        throw new Error('não consegui falar com a API local')
      },
    }
    const host = await mount(inMemoryEntryRepository(), refusing)

    await addLabel(host, 'casa')

    expect(at(host, 'error')?.textContent).toContain('não consegui falar com a API local')
    expect(all(host, 'chosen-label')).toEqual([])
    expect(all(host, 'label-row')).toHaveLength(1)
  })
})
