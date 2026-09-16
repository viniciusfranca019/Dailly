import { sqliteEntryRepository } from './sqlite-entry-repository.js'
import { openDatabase } from './database.js'
import { buildApp } from './app.js'
import { resolveConfig, type ConfigInput, type ServerConfig } from './config.js'

export { resolveConfig, InvalidTimeZoneError } from './config.js'
export type { ServerConfig, ConfigInput } from './config.js'
export { buildApp } from './app.js'
export { openDatabase } from './database.js'
export { sqliteEntryRepository } from './sqlite-entry-repository.js'
export { MIGRATIONS, LATEST_VERSION, migrate, DatabaseTooNewError } from './migrations.js'

export interface RunningServer {
  /** Where the renderer should point, with the port the OS actually gave us. */
  readonly url: string
  readonly config: ServerConfig
  close(): Promise<void>
}

/**
 * Boot the whole server: database, migrations, store, routes, socket.
 *
 * This is the composition root of the server process. It is the only function
 * the Electron shell needs, and — the point of ADR 0009's rule — it runs
 * perfectly well without Electron, which `boots-without-electron.test.ts`
 * proves on every `make check`. While that test can be written, the separation
 * is a fact; the day it cannot, HTTP has stopped paying for itself.
 */
export async function createServer(input: ConfigInput): Promise<RunningServer> {
  const config = resolveConfig(input)
  const db = openDatabase(config.databaseFile)
  const entries = sqliteEntryRepository({ db, zone: config.zone })

  const app = buildApp({
    entries,
    zone: config.zone,
    ...(config.token ? { token: config.token } : {}),
  })

  await app.listen({ host: config.host, port: config.port })

  const address = app.server.address()
  if (address === null || typeof address === 'string') {
    await app.close()
    throw new Error('o servidor subiu sem um endereço TCP')
  }

  return {
    // The port is read back rather than assumed: config asks for 0, and only
    // the OS knows which one it handed over.
    url: `http://${config.host}:${address.port}`,
    config,
    close: async () => {
      await app.close()
      db.close()
    },
  }
}
