import type { ServerModule, Vault } from '../../shell/module.js'
import { VAULT_MIGRATIONS } from './migrations.js'
import { registerVaultRoutes } from './routes.js'

/**
 * O cofre como módulo do servidor: as tabelas e as rotas de gestão.
 *
 * A instância não é construída aqui. Ela é do shell (`shell/vault.ts`), que a
 * entrega no `ProvideContext` — como o repositório de entries, construído pela
 * raiz com as tabelas do módulo dele —, porque o Requests também a usa ao executar — e um cofre
 * por módulo seriam duas DEKs abertas, ou uma trancada que a outra não vê.
 */
export const vaultModule: ServerModule<Vault> = {
  id: 'vault',
  migrations: VAULT_MIGRATIONS,
  provide: ({ vault }) => vault,
  register: (app, _deps, vault) => registerVaultRoutes(app, vault),
}
