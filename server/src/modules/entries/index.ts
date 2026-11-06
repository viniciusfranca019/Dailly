import { randomUUID } from 'node:crypto'
import type { EntryRepository } from '@dailly/domain'
import type { ServerModule } from '../../shell/module.js'
import { registerLabelRoutes } from './label-routes.js'
import { ENTRIES_MIGRATIONS } from './migrations.js'
import { registerEntryRoutes } from './routes.js'
import { sqliteEntryRepository } from './sqlite-entry-repository.js'
import { sqliteLabelStore, type LabelStore } from './sqlite-label-store.js'
import { registerPropertyRoutes } from './property-routes.js'
import { sqlitePropertyDefs, type PropertyDefStore } from './sqlite-property-defs.js'

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
export const entriesModule: ServerModule<{ entries: EntryRepository; labels: LabelStore; propertyDefs: PropertyDefStore }> = {
  id: 'entries',
  migrations: ENTRIES_MIGRATIONS,
  // Labels live here because they are global (PRD Fase 2, RN1): an Entry
  // carries them, whatever product made the Entry.
  provide: ({ db, zone }) => ({
    entries: sqliteEntryRepository({ db, zone }),
    labels: sqliteLabelStore({ db, newId: randomUUID }),
    propertyDefs: sqlitePropertyDefs({ db }),
  }),
  register: (app, _deps, { entries, labels, propertyDefs }) => {
    registerEntryRoutes(app, entries, () => propertyDefs.list())
    registerLabelRoutes(app, labels)
    registerPropertyRoutes(app, propertyDefs)
  },
}

export { validateEntry, validateRange } from './validate.js'
export type { Invalid } from './validate.js'
export { deleteEntryRow, insertEntryRow, labelsExist, setEntryLabels, updateEntryRow } from './rows.js'
export type { EntryRow } from './rows.js'
