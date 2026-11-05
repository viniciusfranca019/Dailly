import type { TaskStore } from '@dailly/tasks-core'
import { randomUUID } from 'node:crypto'
import type { ServerModule } from '../../shell/module.js'
import { TASKS_MIGRATIONS } from './migrations.js'
import { registerTaskRoutes } from './routes.js'
import { sqliteTaskStore } from './sqlite-task-store.js'

/**
 * Tasks: the public surface of the module on the server.
 *
 * The store is its own, built in `provide` from the shared `db`, the same way
 * Requests builds its store. The id is minted here, not by the client, because
 * the server also hands out the key and the rank: the whole task is the
 * store's to compose.
 */
export const tasksModule: ServerModule<TaskStore> = {
  id: 'tasks',
  migrations: TASKS_MIGRATIONS,
  provide: ({ db }) => sqliteTaskStore({ db, newId: randomUUID, now: () => new Date().toISOString() }),
  register: (app, _deps, store) => registerTaskRoutes(app, store),
}
