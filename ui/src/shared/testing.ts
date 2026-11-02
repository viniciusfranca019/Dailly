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
import {
  ExecutionFailedError,
  VaultRefusedError,
  type RequestsPort,
  type SharedDeps,
  type VaultPort,
  type VaultState,
} from '@shared'

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

/** A metade comum: zona e um `now` fixo, como a raiz entrega. */
export function testSharedDeps(options: { zone?: TimeZone; now?: string } = {}): SharedDeps {
  return {
    now: () => options.now ?? '2026-09-16T12:00:00.000Z',
    zone: options.zone ?? UTC,
  }
}

/** Os use-cases de Entry — reais — sobre o store em memória. */
export function testEntryDeps(options: { seed?: readonly Entry[]; now?: string } = {}) {
  const entries = inMemoryEntryRepository(options.seed ?? [])
  const clock = advancingClock(options.now)
  return {
    createEntry: createEntry({ entries, clock, ids: sequentialIds() }),
    queryEntries: queryEntries({ entries }),
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
    async deleteFolder(id) {
      await ready
      return store.deleteFolder(id)
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

/**
 * O cofre dos testes, escrito à mão: estado, senha e valores em memória.
 *
 * Ele recusa como o servidor recusa — trancado, senha errada, sem chave — e é
 * por isso que um teste da tela consegue provar o caminho da senha errada sem
 * rede. A criptografia não está aqui; ela é provada do lado do servidor.
 */
export function testVaultPort(
  options: {
    state?: VaultState
    password?: string
    recoveryKey?: string
    secrets?: Record<string, string>
  } = {},
): VaultPort & { readonly saved: ReadonlyMap<string, string> } {
  let state: VaultState = options.state ?? 'aberto'
  let password = options.password ?? 'uma senha longa'
  const secrets = new Map(Object.entries(options.secrets ?? {}))
  const open = () => {
    if (state !== 'aberto') throw new VaultRefusedError('locked', 'o cofre está trancado: abra-o com a senha')
  }
  return {
    saved: secrets,
    async status() {
      return state
    },
    async create(next) {
      if (state === 'sem-chave') throw new VaultRefusedError('missing-key', 'falta a DAILLY_SECRET_KEY')
      if (state !== 'nao-criado') throw new VaultRefusedError('exists', 'o cofre já existe')
      if (next.length < 8) throw new VaultRefusedError('invalid', 'a senha precisa ter pelo menos 8 caracteres')
      password = next
      state = 'aberto'
      return 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-QRST'
    },
    async unlock(attempt) {
      if (state === 'sem-chave' || state === 'so-recuperacao') {
        throw new VaultRefusedError('missing-key', 'falta a DAILLY_SECRET_KEY')
      }
      if (attempt !== password) throw new VaultRefusedError('wrong-password', 'a senha não abre o cofre')
      state = 'aberto'
    },
    async unlockWithRecovery(key) {
      if (state === 'sem-chave' || state === 'nao-criado') {
        throw new VaultRefusedError('invalid', 'o cofre ainda não foi criado')
      }
      if (key.toUpperCase() !== (options.recoveryKey ?? 'ABCD-EFGH').toUpperCase()) {
        throw new VaultRefusedError('wrong-password', 'a chave de recuperação não abre o cofre')
      }
      state = 'aberto'
    },
    async lock() {
      if (state === 'aberto') state = 'trancado'
    },
    async list() {
      return [...secrets.keys()].sort().map((name) => ({ environment: 'default', name }))
    },
    async reveal(_environment, name) {
      open()
      return secrets.get(name) ?? ''
    },
    async save(_environment, name, value) {
      open()
      secrets.set(name, value)
    },
    async remove(_environment, name) {
      secrets.delete(name)
    },
  }
}
