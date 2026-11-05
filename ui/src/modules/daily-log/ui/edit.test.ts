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
} from '@dailly/domain'
import { testSharedDeps } from '@shared/testing.js'
import DailyLog from './DailyLog.vue'

/**
 * Card #33: correct and delete a day log from the timeline.
 *
 * The use-cases are the real ones over the in-memory store, so a test can
 * delete behind the screen's back (C6) or swap the store for one that fails (C5).
 */
const NOW = '2026-09-16T12:00:00.000Z'
const TODAY_AT = '2026-09-16T09:00:00.000Z'

const seed = (body: string, occurredAt = TODAY_AT): Entry => ({
  id: '00000000-0000-4000-8000-000000000001',
  body,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  labelIds: [],
  props: {},
})

const depsOver = (entries: EntryRepository) => ({
  ...testSharedDeps({ now: NOW }),
  createEntry: createEntry({ entries, clock: fixedClock(NOW), ids: sequentialIds() }),
  queryEntries: queryEntries({ entries }),
  updateEntry: updateEntry({ entries, clock: fixedClock('2026-09-16T15:00:00.000Z') }),
  deleteEntry: deleteEntry({ entries }),
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
  document.body.replaceChildren()
})

async function mount(entries: EntryRepository) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(DailyLog, { deps: depsOver(entries) })
  app.mount(host)
  unmount = () => app.unmount()
  await settle()
  await settle()
  return host
}

const at = <T extends HTMLElement = HTMLElement>(host: HTMLElement, id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)
const titles = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-testid="entry-title"]')].map((el) => el.textContent?.trim())
const editorText = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>(`[data-testid="board"] [${TEXT_ATTR}]`)].map((el) => el.textContent).join('\n')

function type(host: HTMLElement, value: string): void {
  const block = host.querySelector<HTMLElement>(`[data-testid="board"] [${TEXT_ATTR}]`)!
  block.textContent = value
  block.dispatchEvent(new Event('input', { bubbles: true }))
}

async function open(host: HTMLElement, title: string): Promise<void> {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="entry-open"]')].find(
    (b) => b.textContent?.includes(title),
  )!
  button.click()
  await settle()
}

async function click(host: HTMLElement, id: string): Promise<void> {
  at<HTMLButtonElement>(host, id)!.click()
  await settle()
  await settle()
}

describe('C1: opening an entry to correct it', () => {
  it('loads the body and the day into the editor, with save, cancel and delete', async () => {
    const host = await mount(inMemoryEntryRepository([seed('Reunião com o time')]))

    await open(host, 'Reunião com o time')

    expect(editorText(host)).toBe('Reunião com o time')
    expect(at<HTMLInputElement>(host, 'day-input')!.value).toBe('2026-09-16')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Salvar')
    expect(at(host, 'cancel')!.textContent?.trim()).toBe('Cancelar edição')
    expect(at(host, 'delete')).not.toBeNull()
  })

  it('opens from the keyboard, since the entry is a button', async () => {
    const host = await mount(inMemoryEntryRepository([seed('Reunião com o time')]))
    expect(at(host, 'entry-open')!.tagName).toBe('BUTTON')
  })
})

describe('C2: saving the correction', () => {
  it('shows the corrected entry on the same day and keeps id and creation (RN5)', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    type(host, 'Reunião com o time de dados')
    await settle()
    await click(host, 'submit')

    expect(titles(host)).toEqual(['Reunião com o time de dados'])
    const [stored] = await entries.list({})
    expect(stored).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: TODAY_AT,
      occurredAt: TODAY_AT,
      updatedAt: '2026-09-16T15:00:00.000Z',
    })
    // Back to a new entry: the editor is empty and says "Registrar" again.
    expect(editorText(host)).toBe('')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Registrar')
  })

  it('saves with Ctrl+S too', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')
    type(host, 'corrigido pelo atalho')
    await settle()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await settle()
    await settle()

    expect(titles(host)).toEqual(['corrigido pelo atalho'])
  })
})

describe('C3: moving the entry to another day', () => {
  it('lands on yesterday at noon, by the composer rule (RN5)', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    const input = at<HTMLInputElement>(host, 'day-input')!
    input.value = '2026-09-15'
    input.dispatchEvent(new Event('change'))
    await settle()
    await click(host, 'submit')

    const [stored] = await entries.list({})
    expect(stored?.occurredAt).toBe('2026-09-15T12:00:00.000Z')
    expect(host.textContent).toContain('Ontem')
  })
})

describe('C4: an emptied body is refused', () => {
  it('says the body is required and keeps the entry as it was', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    type(host, 'x')
    await settle()
    type(host, '   ')
    await settle()
    // While correcting, "Salvar" stays enabled on an empty board, so the
    // refusal is the domain's and says why, instead of a dead button.
    expect(at<HTMLButtonElement>(host, 'submit')!.disabled).toBe(false)
    await click(host, 'submit')

    expect(at(host, 'error')?.textContent).toContain('o corpo da entrada é obrigatório')
    expect((await entries.list({}))[0]?.body).toBe('Reunião com o time')
  })
})

describe('C5: the API being down does not lose the correction', () => {
  it('shows the error and keeps the corrected text in the editor', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const failing: EntryRepository = {
      ...entries,
      update: async () => {
        throw new Error('não consegui falar com a API local')
      },
    }
    const host = await mount(failing)
    await open(host, 'Reunião com o time')

    type(host, 'texto corrigido')
    await settle()
    await click(host, 'submit')

    expect(at(host, 'error')?.textContent).toContain('não consegui falar com a API local')
    expect(editorText(host)).toBe('texto corrigido')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Salvar')
  })
})

describe('C6: an entry deleted in another tab', () => {
  it('says it is gone, goes back to a new entry and reloads the timeline (RN7)', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    await entries.delete('00000000-0000-4000-8000-000000000001')
    type(host, 'tarde demais')
    await settle()
    await click(host, 'submit')

    expect(at(host, 'error')?.textContent).toContain('registro não encontrado')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Registrar')
    expect(titles(host)).toEqual([])
  })
})

describe('C7, C8: deleting an entry', () => {
  it('C7: removes it from the timeline after confirming', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    await click(host, 'delete')
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull()
    await click(host, 'confirm-delete')

    expect(titles(host)).toEqual([])
    expect(await entries.list({})).toEqual([])
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Registrar')
  })

  it('C8: cancelling the confirmation changes nothing and keeps the entry open', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')

    await click(host, 'delete')
    await click(host, 'keep')

    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(titles(host)).toEqual(['Reunião com o time'])
    expect(editorText(host)).toBe('Reunião com o time')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Salvar')
  })
})

describe('cancelling the correction', () => {
  it('goes back to a new entry without saving', async () => {
    const entries = inMemoryEntryRepository([seed('Reunião com o time')])
    const host = await mount(entries)
    await open(host, 'Reunião com o time')
    type(host, 'mudança descartada')
    await settle()

    await click(host, 'cancel')

    expect(editorText(host)).toBe('')
    expect(at(host, 'submit')!.textContent?.trim()).toBe('Registrar')
    expect((await entries.list({}))[0]?.body).toBe('Reunião com o time')
  })
})
