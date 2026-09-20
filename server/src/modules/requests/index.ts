import type { RequestStore } from '@dailly/requests-core'
import { sqliteRequestStore } from './sqlite-request-store.js'
import type { ServerModule } from '../../shell/module.js'
import { REQUESTS_MIGRATIONS } from './migrations.js'
import { registerRequestRoutes } from './routes.js'

/**
 * Requests — superfície pública do módulo no servidor.
 *
 * Ele é o primeiro a usar o `provide`: o store é dele e de mais ninguém, e o
 * `ServerModuleDeps` não cresceu um campo por causa dele. É exatamente o
 * gatilho que a ADR 0006, Emenda 2, escreveu.
 */
export const requestsModule: ServerModule<RequestStore> = {
  id: 'requests',
  migrations: REQUESTS_MIGRATIONS,
  provide: ({ db }) => sqliteRequestStore({ db }),
  register: (app, _deps, store) => registerRequestRoutes(app, store),
}
