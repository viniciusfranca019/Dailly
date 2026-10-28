import type { Folder, SavedRequest } from '@dailly/requests-core'
import { type ExecutedResponse, type ModuleDeps, type RequestsPort } from '@shared'
import { testModuleDeps } from '@shared/testing.js'
import { createApp } from 'vue'
import Requests from './Requests.vue'

/**
 * O que as suítes do Requests compartilham: montar a tela, achar, clicar,
 * preencher, arrastar, e as sementes. Saiu do `requests.test.ts` quando ele
 * passou de duas mil linhas e virou um arquivo por área.
 */

/** Vue renderiza na fila de microtasks; um teste tem que deixar. */
export const settle = async () => {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

export const mount = (deps: ModuleDeps) => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(Requests, { deps })
  app.mount(host)
  return { host, destroy: () => app.unmount() }
}

export const at = <T extends HTMLElement>(host: HTMLElement, id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)
export const allAt = (host: HTMLElement, id: string) =>
  [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
export const text = (host: HTMLElement, id: string) => at(host, id)?.textContent?.trim() ?? ''

/**
 * O gesto inteiro, e não só o `click`.
 *
 * `mousedown` é o que fecha menu, e um helper que o pulava deixava duas
 * mutações do `AddMenu` sobreviverem à suíte inteira. Um teste que clica de um
 * jeito que nenhum navegador clica prova menos do que parece.
 */
export const click = async (element: HTMLElement | null) => {
  // Estoura em vez de não fazer nada: um clique num elemento ausente era um
  // passo que sumia em silêncio, e o teste só falhava depois, noutro lugar.
  if (!element) throw new Error('não há esse elemento na tela para clicar')
  for (const type of ['mousedown', 'mouseup', 'click']) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  }
  await settle()
}

export const fill = async (element: HTMLElement | null, value: string) => {
  const field = element as HTMLInputElement | HTMLTextAreaElement | null
  if (!field) throw new Error('campo não está na tela')
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}

export const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  parentId,
  name,
  position: 0,
})

export const request = (id: string, name: string, folderId: string | null = null): SavedRequest => ({
  id,
  name,
  protocol: 'http',
  spec: { method: 'GET', url: 'https://x.dev/a', headers: [], body: null, query: [], auth: null },
  folderId,
  position: 0,
})

export const executed = (over: Partial<ExecutedResponse> = {}): ExecutedResponse => ({
  status: 200,
  headers: [{ name: 'content-type', value: 'application/json' }],
  body: '{"ok":true}',
  encoding: 'utf-8',
  truncated: false,
  timedOut: false,
  bytes: 11,
  contentLength: 11,
  durationMs: 42,
  ...over,
})

export const deps = (requests: RequestsPort) => testModuleDeps({ requests })

/**
 * Espera uma condição, em vez de um número fixo de turnos.
 *
 * `settle()` basta para quase tudo, mas descomprimir 16 MB não termina em
 * quatro microtasks — e um `settle` maior seria um número mágico maior.
 */
export async function until(condition: () => boolean, turns = 400): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('a condição não aconteceu a tempo')
}

/**
 * Os dois caminhos que o `+` abre.
 *
 * Helpers e não cliques soltos porque agora são dois passos, e repetir os dois
 * em vinte testes esconderia qual deles quebrou quando um quebrar.
 */
export const novaRequest = async (host: HTMLElement) => {
  await click(at(host, 'add-root'))
  await click(at(host, 'menu-new-request'))
}

export const novaPasta = async (host: HTMLElement) => {
  await click(at(host, 'add-root'))
  await click(at(host, 'menu-new-folder'))
}

/** Uma promessa que o teste solta quando quiser — para exercitar o "no meio". */
export const held = () => {
  let release = (): void => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

export const CURL = `curl -X POST https://api.stripe.com/v1/charges -H 'Idempotency-Key: k1' -d '{"amount":100}'`

/**
 * O colar de um navegador, e não o do jsdom.
 *
 * Um evento que o usuário dispara roda cada listener com a pilha vazia, e o
 * navegador esvazia a fila de microtasks **entre um listener e o próximo** (o
 * "clean up after running script" do HTML). O `dispatchEvent` do jsdom chama
 * todos de uma vez, dentro do script do teste, e a fila só roda no fim. Com o
 * `fill` acima a suíte passava enquanto colar não importava nada no Chromium:
 * o `v-model` gravava a URL, um `watch` rodava no intervalo, e o segundo
 * listener já não via salto nenhum.
 *
 * Por isso os listeners de `input` do campo são gravados quando o Vue os
 * registra, e chamados aqui um a um, com a fila esvaziada entre eles.
 */
export const registered = new WeakMap<EventTarget, EventListenerOrEventListenerObject[]>()
export const addEventListener = HTMLInputElement.prototype.addEventListener

export const inputLikeABrowser = async (
  element: HTMLElement | null,
  value: string,
  inputType: 'insertFromPaste' | 'insertText' = 'insertFromPaste',
) => {
  const field = element as HTMLInputElement | null
  if (!field) throw new Error('campo não está na tela')
  field.value = value
  const event = new InputEvent('input', { bubbles: true, inputType, data: value })
  Object.defineProperty(event, 'target', { value: field })
  Object.defineProperty(event, 'currentTarget', { value: field })
  for (const listener of registered.get(field) ?? []) {
    if (typeof listener === 'function') listener.call(field, event)
    else listener.handleEvent(event)
    for (let turn = 0; turn < 4; turn++) await Promise.resolve()
  }
  await settle()
}

/**
 * A árvore no jeito do Apidog: pastas que abrem e fecham com a contagem, o
 * método colorido, o ⋯ e o clique direito, arrastar entre pastas, renomear e
 * apagar.
 *
 * O jsdom não tem `DragEvent` nem `DataTransfer`: os eventos de arrastar vão
 * como `Event` cru, e a tela guarda o que está sendo arrastado no próprio
 * estado — o `dataTransfer` só é tocado quando existe.
 */
export const drag = async (from: HTMLElement | null, to: HTMLElement | null) => {
  if (!from || !to) throw new Error('arrastar precisa de origem e destino na tela')
  from.dispatchEvent(new Event('dragstart', { bubbles: true }))
  const over = new Event('dragover', { bubbles: true, cancelable: true })
  to.dispatchEvent(over)
  to.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
  from.dispatchEvent(new Event('dragend', { bubbles: true }))
  await settle()
  return { accepted: over.defaultPrevented }
}

export const rightClick = async (element: HTMLElement | null) => {
  if (!element) throw new Error('não há esse elemento para o clique direito')
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 })
  element.dispatchEvent(event)
  await settle()
  return event
}

export const folderRow = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="folder"][data-folder-id="${id}"]`)
export const requestRow = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="request"][data-request-id="${id}"]`)
export const menuOf = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLElement>(
    `[data-testid="add-in-folder"][data-folder-id="${id}"], [data-testid="request-menu"][data-request-id="${id}"]`,
  )
export const menuItems = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => item.textContent?.trim())
