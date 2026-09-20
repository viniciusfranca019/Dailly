import { sqliteEntryRepository } from './adapters/sqlite-entry-repository.js'
import { MODULES } from './modules.js'
import { buildApp } from './shell/app.js'
import { resolveConfig, type ConfigInput, type ServerConfig } from './shell/config.js'
import { openDatabase } from './shell/database.js'
import { collectMigrations } from './shell/migrations.js'
import { assertManifest, type ServerModule } from './shell/module.js'

export { resolveConfig, InvalidTimeZoneError } from './shell/config.js'
export type { ServerConfig, ConfigInput } from './shell/config.js'
export { buildApp } from './shell/app.js'
export { openDatabase } from './shell/database.js'
export { sqliteEntryRepository } from './adapters/sqlite-entry-repository.js'
export {
  MIGRATIONS,
  LATEST_VERSION,
  migrate,
  collectMigrations,
  DatabaseTooNewError,
} from './shell/migrations.js'
export { ManifestError, assertManifest } from './shell/module.js'
export type { ServerModule, ServerModuleDeps } from './shell/module.js'
export type { Migration } from './shell/migrations.js'
export { MODULES } from './modules.js'

export interface RunningServer {
  /** Para onde o renderer deve apontar, com a porta que o SO realmente deu. */
  readonly url: string
  readonly config: ServerConfig
  close(): Promise<void>
}

/**
 * Sobe o servidor inteiro: banco, migrations, store, rotas, socket.
 *
 * Este é o composition root do processo. É a única função de que o shell
 * Electron precisa e — o ponto da regra da ADR 0009 — ela roda perfeitamente
 * sem Electron, o que o `boots-without-electron.test.ts` prova a cada
 * `make check`. Enquanto esse teste puder ser escrito, a separação é um fato;
 * no dia em que não puder, o HTTP deixou de se pagar.
 *
 * **A ordem aqui não é arbitrária.** O manifest é validado e as migrations são
 * coletadas *antes* de o arquivo ser aberto: um manifest inconsistente derruba
 * o boot sem ter escrito nada. Um boot que falha depois de aplicar metade do
 * schema é pior que um que não sobe.
 *
 * **Pressuposição do parâmetro `modules`, dita porque ela não é checada.** O
 * repositório de entries é construído aqui, incondicionalmente, fora do laço do
 * manifest — então a lista passada não determina sozinha a composição: ela
 * precisa conter o módulo entries, ou a tabela que o repositório lê não existe.
 * Violada, quem reclama é o SQLite (`no such table: entries`), não o contrato.
 * A saída — um `provide(db, zone)` no `ServerModule` — está decidida e adiada
 * na ADR 0006, Emenda 1, com o Requests como gatilho.
 */
export async function createServer(
  input: ConfigInput,
  modules: readonly ServerModule[] = MODULES,
): Promise<RunningServer> {
  const config = resolveConfig(input)

  assertManifest(modules)
  const migrations = collectMigrations(modules)

  const db = openDatabase(config.databaseFile, migrations)
  const entries = sqliteEntryRepository({ db, zone: config.zone })

  const app = buildApp(
    {
      entries,
      zone: config.zone,
      ...(config.token ? { token: config.token } : {}),
    },
    modules,
  )

  await app.listen({ host: config.host, port: config.port })

  const address = app.server.address()
  if (address === null || typeof address === 'string') {
    await app.close()
    db.close()
    throw new Error('o servidor subiu sem um endereço TCP')
  }

  return {
    // A porta é lida de volta em vez de assumida: a config pede 0, e só o SO
    // sabe qual ele entregou.
    url: `http://${config.host}:${address.port}`,
    config,
    close: async () => {
      await app.close()
      db.close()
    },
  }
}
