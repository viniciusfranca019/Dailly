import type { EntryRepository } from '@dailly/domain'
import type { ServerModule } from '../../shell/module.js'
import { ENTRIES_MIGRATIONS } from './migrations.js'
import { registerEntryRoutes } from './routes.js'
import { sqliteEntryRepository } from './sqlite-entry-repository.js'

/**
 * Entries — superfície pública do módulo no servidor.
 *
 * Tudo que o shell precisa saber passa por aqui, e nada mais: um import do
 * shell para dentro de `modules/entries/**` é violação de fronteira, e o
 * `architecture.test.ts` falha nomeando o arquivo.
 *
 * O repositório nasce no `provide`, como o de todo módulo (card #29). Ele era
 * montado pelo composition root e entregue no saco de todos porque o teste do
 * 501 injetava outro a cada `buildApp`; esse teste agora monta as rotas sobre
 * o repositório que recusa (`routes.test.ts`), sem o shell no meio.
 */
export const entriesModule: ServerModule<EntryRepository> = {
  id: 'entries',
  migrations: ENTRIES_MIGRATIONS,
  provide: ({ db, zone }) => sqliteEntryRepository({ db, zone }),
  register: (app, _deps, entries) => registerEntryRoutes(app, entries),
}

export { validateEntry, validateRange } from './validate.js'
export type { Invalid } from './validate.js'
export { deleteEntryRow, insertEntryRow, updateEntryRow } from './rows.js'
export type { EntryRow } from './rows.js'
