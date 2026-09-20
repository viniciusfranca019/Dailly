import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { LATEST_VERSION, createServer, type RunningServer } from './index.js'
import { MODULES } from './modules.js'
import { buildApp } from './shell/app.js'
import { ManifestError, assertManifest, type AnyServerModule } from './shell/module.js'

/**
 * C3 — um módulo entra pelo manifest, não por import no shell.
 *
 * O módulo aqui é escrito à mão, não mockado: o contrato que o teste exercita
 * é o mesmo que `entries` implementa, e um fake de módulo é a única forma de
 * provar a regra com um módulo só no manifest de verdade.
 *
 * A metade estrutural deste cenário — "o shell não importa o módulo em lugar
 * nenhum" — mora no `architecture.test.ts`, onde é verificável.
 */
/** Um handle de banco que nunca é tocado — o `provide` do fake não consulta nada. */
const fakeDb = () => ({ marca: 'banco falso' }) as never

const fakeModule = (over: Partial<AnyServerModule> = {}): AnyServerModule => ({
  id: 'fake',
  migrations: [],
  register(app) {
    app.get('/fake', async () => ({ from: 'o módulo, não o shell' }))
  },
  ...over,
})

const deps = () => ({ entries: inMemoryEntryRepository(), zone: UTC })

describe('C3: um módulo entra pelo manifest, não por import no shell', () => {
  it('responde na rota que o módulo registrou', async () => {
    const app = buildApp(deps(), [fakeModule()])

    const response = await app.inject({ method: 'GET', url: '/fake' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ from: 'o módulo, não o shell' })
  })

  it('entrega ao módulo as dependências resolvidas pelo shell', async () => {
    // O módulo não abre banco nem lê env: recebe o que o composition root já
    // resolveu. É o que permite trocar o repositório num teste sem tocar no
    // módulo.
    let seen: unknown
    const app = buildApp(deps(), [
      fakeModule({
        register(app, received) {
          seen = received.zone
          app.get('/fake', async () => ({ ok: true }))
        },
      }),
    ])
    await app.inject({ method: 'GET', url: '/fake' })

    expect(seen).toBe(UTC)
  })

  it('recusa um manifest com dois módulos de mesmo id, nomeando o id', async () => {
    expect(() => assertManifest([fakeModule(), fakeModule()])).toThrow(ManifestError)
    expect(() => assertManifest([fakeModule(), fakeModule()])).toThrow(/fake/)
  })

  it('recusa um manifest vazio — um build sem módulo nenhum é um erro de composição', () => {
    expect(() => assertManifest([])).toThrow(ManifestError)
  })
})

describe('C3: a migration do módulo é a que roda de verdade', () => {
  /**
   * O terceiro membro do contrato, que os outros testes não exercitavam.
   *
   * `register()` tinha prova e `id` tinha prova; `migrations` não. O fake do
   * bloco acima declara `migrations: []`, então o caminho que leva a fatia de
   * um módulo até o arquivo passava por baixo de toda a suíte — e passava
   * mesmo com `openDatabase` e `migrate` ignorando a lista recebida.
   *
   * O defeito aqui é ausência de guarda, não comportamento errado: o teste
   * nasce verde contra a árvore limpa. O que ele prova é a regressão, e ela
   * foi verificada aplicando a mutação de verdade — `openDatabase` chamado sem
   * a lista no composition root derruba este teste, e só este.
   */
  let server: RunningServer | undefined
  let dir: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('cria no arquivo a tabela que o módulo declarou, e para na versão dele', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dailly-c3-'))
    const file = join(dir, 'dailly.sqlite')

    server = await createServer({ databaseFile: file }, [
      // O manifest de verdade entra junto, e isto é a pressuposição do
      // `createServer` aparecendo à luz: ele constrói o `sqliteEntryRepository`
      // incondicionalmente, fora do laço do manifest, então o parâmetro
      // `modules` não determina sozinho a composição. Sem o entries na lista,
      // quem reclama é o SQLite — `no such table: entries` — e não o contrato.
      //
      // Consequência para o C3: o cenário como aprovado ("um módulo registrado
      // com id, migrations e register()... as rotas dele respondem") não é
      // satisfazível só por `createServer`. A suíte o prende em dois pontos: a
      // metade das rotas pelo `buildApp`, acima, onde o fake sobe sozinho; e a
      // metade da migration aqui, onde ele sobe ao lado do manifest real.
      // Registrado na ADR 0006, Emenda 2, com o gatilho que resolve.
      ...MODULES,
      // A versão é derivada, não escrita à mão. `modules/entries/migrations.ts`
      // anuncia por extenso que `labels` e companhia "chegam como migration 2";
      // fixar 2 aqui reservaria o número que a produção já reivindicou, e no
      // dia da Fase 2 este teste falharia com `ManifestError` — acusando a
      // fixture em vez do código que ele existe para provar.
      fakeModule({
        id: 'com-schema',
        migrations: [
          { version: LATEST_VERSION + 1, up: 'CREATE TABLE extra (id TEXT PRIMARY KEY);' },
        ],
      }),
    ])
    await server.close()
    server = undefined

    const db = new Database(file, { readonly: true })
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name)

    expect(tables).toContain('extra')
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION + 1)
    db.close()
  })
})

describe('a isenção do /health é a rota, não o prefixo da URL', () => {
  /**
   * O gate achou isto e a linha nem tinha mudado.
   *
   * Antes da reformulação o shell era dono de toda rota, e `/health` era a
   * única string que casava com `startsWith('/health')`. Depois dela qualquer
   * módulo registra caminho arbitrário na mesma instância — e aí um prefixo
   * deixa de ser uma isenção e vira superfície de bypass.
   *
   * O comentário que eu escrevi em `shell/app.ts` afirmava o contrário, e a
   * ADR 0011 se apoia nessa afirmação para dizer que a rota de execução das
   * requests — egresso arbitrário para a internet, a partir da máquina do
   * usuário — passa pelo hook como todas as outras. Com prefixo, um
   * `/health/executor` não passaria.
   */
  const probing = (): AnyServerModule => ({
    id: 'sondas',
    migrations: [],
    register(app) {
      app.get('/healthz', async () => ({ probe: true }))
      app.get('/health/executor', async () => ({ probe: true }))
      app.get('/requests', async () => ({ probe: true }))
    },
  })

  const guarded = () => buildApp({ ...deps(), token: 'segredo' }, [probing()])

  it.each(['/healthz', '/health/executor', '/requests'])(
    'exige o token em %s, porque nenhuma delas é o /health do shell',
    async (url) => {
      const response = await guarded().inject({ method: 'GET', url })

      expect(response.statusCode).toBe(401)
    },
  )

  it('continua deixando o /health de verdade passar, com e sem query', async () => {
    // O shell faz polling nele para saber quando o servidor subiu, antes de
    // ter qualquer outra coisa — inclusive o token.
    const app = guarded()

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/health?probe=1' })).statusCode).toBe(200)
  })
})

describe('o módulo traz a própria dependência, em vez de o contrato crescer um campo', () => {
  /**
   * A abstração que a ADR 0006, Emenda 2, adiou com gatilho nomeado: *"o
   * módulo Requests da ADR 0011 é o segundo chamador, e é ele que paga"*.
   *
   * Sem ela, trazer o Requests obrigaria a editar `ServerModuleDeps` para
   * acrescentar um campo — e o módulo entries passaria a enxergar o store de
   * requests, e vice-versa. É o tell da Lei 4: acrescentar um caso obriga a
   * editar algo que já funciona.
   *
   * `provide` é opcional de propósito. O entries não tem: o repositório dele é
   * construído pelo composition root e entregue no saco, porque o teste do 501
   * em `app.test.ts` injeta um `entries` diferente a cada chamada e isso
   * precisa continuar possível.
   */
  it('entrega ao módulo o que o provide dele devolveu', async () => {
    const proprio = { marca: 'só deste módulo' }
    let recebido: unknown

    const app = buildApp({ ...deps(), db: fakeDb() }, [
      fakeModule({
        provide: () => proprio,
        register(app, _deps, own) {
          recebido = own
          app.get('/fake', async () => ({ ok: true }))
        },
      }),
    ])
    await app.inject({ method: 'GET', url: '/fake' })

    expect(recebido).toBe(proprio)
  })

  it('um módulo sem provide continua recebendo o saco compartilhado', async () => {
    let zona: unknown
    const app = buildApp(deps(), [
      fakeModule({
        register(app, received) {
          zona = received.zone
          app.get('/fake', async () => ({ ok: true }))
        },
      }),
    ])
    await app.inject({ method: 'GET', url: '/fake' })

    expect(zona).toBe(UTC)
  })

  it('o provide recebe o banco e a zona, e mais nada', () => {
    let contexto: unknown
    const db = fakeDb()

    buildApp({ ...deps(), db }, [
      fakeModule({
        provide: (context) => {
          contexto = context
          return null
        },
      }),
    ])

    expect(contexto).toEqual({ db, zone: UTC })
  })

  it('falha nomeando o módulo quando ele precisa de banco e não há banco', () => {
    // O caminho que um `!` esconderia: um `buildApp` de teste, sem banco, com
    // um módulo que precisa dele. Melhor falhar dizendo qual módulo do que
    // entregar `undefined` e quebrar na primeira rota.
    const boom = () => buildApp(deps(), [fakeModule({ id: 'precisa-de-banco', provide: () => 1 })])

    expect(boom).toThrow(ManifestError)
    expect(boom).toThrow(/precisa-de-banco/)
  })
})
