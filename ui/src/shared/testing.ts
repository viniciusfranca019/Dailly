import {
  createEntry,
  inMemoryEntryRepository,
  queryEntries,
  sequentialIds,
  type Clock,
  type Entry,
} from '@dailly/domain'
import type { Folder, SavedRequest } from '@dailly/requests-core'
import { inMemoryRequestStore } from '@dailly/requests-core/testing'
import { UTC, type TimeZone } from '@dailly/periods'
import { ExecutionFailedError, type ModuleDeps, type RequestsPort } from '@shared'

/**
 * The dependencies a shell test runs on: the **real** use-cases over the
 * in-memory store, not stubs.
 *
 * Stubbing the use-cases here would make these tests agree with themselves —
 * they would pass with a `createEntry` that never normalizes or a
 * `queryEntries` that never orders. Composing the real ones over a fake store
 * keeps the only fake at the boundary where fakes belong.
 *
 * It lives in `shared/` and not in `shell/` because the architecture test said
 * so, out loud: nothing outside the shell may import the shell, and a Daily Log
 * test needed these deps too. The rule was right and the convenient placement
 * was wrong — this is not composition, it is a fixture that happens to compose.
 */
/**
 * A clock that moves, one minute per reading.
 *
 * `fixedClock` would be the obvious choice and it is the wrong one here: two
 * entries saved in the same test would share an instant *and* a `createdAt`,
 * leaving them with no defined order — the repository's tie-break has nothing
 * left to break. Real time advances between two saves, and a fixture that
 * pretends otherwise tests a situation that cannot happen.
 */
const advancingClock = (from = '2026-09-16T12:00:00.000Z'): Clock => {
  let readings = 0
  return { now: () => new Date(Date.parse(from) + readings++ * 60_000).toISOString() }
}

export function testModuleDeps(
  options: {
    seed?: readonly Entry[]
    zone?: TimeZone
    now?: string
    requests?: RequestsPort
  } = {},
): ModuleDeps {
  const entries = inMemoryEntryRepository(options.seed ?? [])
  const clock = advancingClock(options.now)
  return {
    createEntry: createEntry({ entries, clock, ids: sequentialIds() }),
    now: () => options.now ?? '2026-09-16T12:00:00.000Z',
    queryEntries: queryEntries({ entries }),
    zone: options.zone ?? UTC,
    requests: options.requests ?? testRequestsPort(),
  }
}

/**
 * A port de Requests que os testes rodam: o fake **escrito à mão** do pacote,
 * mais um `execute` que o teste substitui.
 *
 * O fake vem do `@dailly/requests-core/testing` em vez de ser reescrito aqui
 * porque lá ele é provado contra o mesmo contrato que o SQLite — um fake local
 * concordaria com o teste e discordaria do servidor, que é a forma mais cara
 * de suíte verde. `execute` é o único stub, e é stub porque do outro lado dele
 * há rede de verdade: não existe fake honesto de "a internet respondeu".
 */
export function testRequestsPort(
  options: {
    folders?: readonly Folder[]
    requests?: readonly SavedRequest[]
    execute?: RequestsPort['execute']
  } = {},
): RequestsPort {
  const store = inMemoryRequestStore()

  /**
   * Semear é assíncrono porque a port é, e um construtor não espera.
   *
   * Cada método aguarda este promise antes de responder, então um teste que
   * monta a tela e lê a árvore vê a semente — sem isso a primeira leitura
   * poderia chegar antes da última inserção, e a falha seria intermitente,
   * que é a pior espécie.
   */
  const ready = (async () => {
    for (const folder of options.folders ?? []) await store.saveFolder(folder)
    for (const request of options.requests ?? []) await store.saveRequest(request)
  })()

  return {
    async folders() {
      await ready
      return store.folders()
    },
    async requests() {
      await ready
      return store.requests()
    },
    async saveFolder(folder) {
      await ready
      return store.saveFolder(folder)
    },
    async saveRequest(request) {
      await ready
      return store.saveRequest(request)
    },
    async deleteRequest(id) {
      await ready
      return store.deleteRequest(id)
    },
    execute:
      options.execute ??
      (async () => {
        throw new ExecutionFailedError(
          'offline',
          'este teste não disse o que a execução devolve',
        )
      }),
  }
}
