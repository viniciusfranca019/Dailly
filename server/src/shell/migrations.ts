import type { Database } from 'better-sqlite3'
import { MODULES } from '../modules.js'
import { ManifestError, type Migration, type ServerModule } from './module.js'

/**
 * Versionamento de schema por `PRAGMA user_version`, como a
 * [ADR 0002 §5](../../../docs/adrs/0002-data-layer.md) decidiu.
 *
 * A versão mora **dentro do arquivo**, e é isso que faz a história de backup da
 * ADR 0005 funcionar: restaurar um `.sqlite` antigo e abri-lo roda exatamente
 * as migrations que faltam, sem contabilidade externa para se perder.
 *
 * O runner é do shell; as migrations são dos módulos. A tensão entre as duas
 * coisas está em `collectMigrations`, logo abaixo.
 */

export type { Migration } from './module.js'

/**
 * Junta as fatias dos módulos numa sequência só, e recusa colisão.
 *
 * `user_version` é um inteiro por arquivo: não existe "versão do módulo
 * entries" e "versão do módulo requests", existe *a* versão do banco. Então os
 * números são globais mesmo quando o código que os declara é local, e dois
 * módulos podem escolher o mesmo sem que tipo nenhum perceba.
 *
 * A alternativa seria uma tabela própria de controle, com versão por módulo.
 * Ela resolveria a coordenação manual, e custaria abandonar `user_version` —
 * ou seja, custaria a propriedade que a ADR 0005 usa. Coordenar à mão e falhar
 * alto é o lado barato desse par.
 *
 * A mensagem nomeia a versão e os dois módulos porque é exatamente o que falta
 * saber no momento em que o boot quebra.
 */
export function collectMigrations(modules: readonly ServerModule[]): readonly Migration[] {
  const owner = new Map<number, string>()
  const collected: Migration[] = []

  for (const module of modules) {
    for (const migration of module.migrations) {
      const existing = owner.get(migration.version)
      if (existing !== undefined) {
        throw new ManifestError(
          `a migration ${migration.version} é declarada por dois módulos: ${existing} e ${module.id}. ` +
            'O user_version é uma sequência única do arquivo — escolha um número livre.',
        )
      }
      owner.set(migration.version, module.id)
      collected.push(migration)
    }
  }

  return collected.sort((a, b) => a.version - b.version)
}

/** O schema que este build conhece, montado a partir do manifest. */
export const MIGRATIONS: readonly Migration[] = collectMigrations(MODULES)

/** A versão em que este build espera encontrar um banco. */
export const LATEST_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
)

/**
 * O arquivo está à frente do schema que este processo sabe aplicar.
 *
 * A frase diz **"o schema montado aqui"**, não "esta versão do dailly", e a
 * diferença nasceu quando `migrate` ganhou a lista como parâmetro: no caminho
 * de produção os dois coincidem com o `LATEST_VERSION`, mas com um manifest
 * montado à mão eles divergem — e a versão anterior da frase afirmava com
 * segurança um número que era do outro. A ADR 0005 apoia a história de restore
 * neste aviso; um aviso sobre perda de dados que erra o número é pior que
 * nenhum.
 */
export class DatabaseTooNewError extends Error {
  override readonly name = 'DatabaseTooNewError'
  constructor(found: number, expected: number) {
    super(
      `o banco está na versão ${found}, mas o schema montado aqui vai até a ${expected}. ` +
        'Abrir assim arriscaria corromper dados escritos por uma versão mais nova.',
    )
  }
}

/**
 * Leva um banco até a última versão, e informa onde ele parou.
 *
 * Cada migration roda dentro de uma transação junto com o bump do
 * `user_version`, então uma falha no meio deixa o arquivo na última versão que
 * aplicou por inteiro — nunca numa versão cujas instruções rodaram pela metade.
 */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): number {
  const current = db.pragma('user_version', { simple: true }) as number
  const latest = migrations.reduce((max, migration) => Math.max(max, migration.version), 0)

  // Recusar abrir um arquivo mais novo é a metade barata da história de backup:
  // restaurar de uma versão futura é uma armadilha de perda de dados, e
  // silêncio é a pior resposta possível para ela.
  if (current > latest) throw new DatabaseTooNewError(current, latest)

  for (const migration of migrations) {
    if (migration.version <= current) continue
    db.transaction(() => {
      db.exec(migration.up)
      // `user_version` não aceita parâmetro ligado, daí a interpolação. A
      // justificativa antiga — "vem da lista deste build" — deixou de valer
      // quando a lista virou parâmetro. O que continua valendo, e é o que
      // importa: o número é declarado por um módulo em código, e nenhum
      // caminho de requisição chega até aqui.
      db.pragma(`user_version = ${migration.version}`)
    })()
  }

  return db.pragma('user_version', { simple: true }) as number
}
