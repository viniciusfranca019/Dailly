/**
 * @file O contrato de módulo do servidor — o gêmeo do `ModuleDescriptor` da `ui/`.
 *
 * A ADR 0006 decidiu duas camadas no frontend e escreveu o critério de entrada
 * em cada uma; a Emenda 2 aplicou a mesma decisão a este lado. O shell não sabe
 * o nome de módulo nenhum: lê o manifest e monta o que estiver lá.
 *
 * As três divergências em relação ao gêmeo — sem flag de build, migrations numa
 * sequência global, e um saco de dependências que nomeia tipo de produto — têm
 * causa escrita na Emenda 2, e só lá, para não derivarem em três cópias.
 */

import type { EntryRepository } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'
import type { FastifyInstance } from 'fastify'

/**
 * Uma fatia de schema, e o motivo de ela morar no arquivo do contrato.
 *
 * O tipo é do contrato, não do runner: é por ele que um módulo declara o que
 * precisa no banco. Deixá-lo em `shell/migrations.ts` obrigava todo módulo a
 * importar o arquivo que **calcula `MIGRATIONS` a partir do manifest** — e
 * essa é exatamente a aresta que fecha o ciclo
 * `shell/migrations → modules → modules/entries → shell/migrations`.
 *
 * Hoje o ciclo existe e é seguro porque toda seta de volta é `import type` e
 * some na compilação. Seguro por acidente, então. Com o tipo aqui, a única
 * seta legítima de um módulo para o shell é este arquivo — e aí a regra fica
 * enunciável sem exceção, que é o que o `architecture.test.ts` cobra.
 */
export interface Migration {
  readonly version: number
  readonly up: string
}

export interface ServerModuleDeps {
  readonly entries: EntryRepository
  readonly zone: TimeZone
}

export interface ServerModule {
  /** Identidade estável, usada no manifest e nas mensagens de erro. */
  readonly id: string
  /**
   * A fatia deste módulo no `user_version`, que é uma sequência **global**.
   *
   * O módulo escolhe os números; `collectMigrations` recusa colisão. A
   * coordenação entre módulos é manual, e a asserção é o que a torna segura.
   */
  readonly migrations: readonly Migration[]
  /** Onde o módulo pendura suas rotas. Recebe o que o composition root resolveu. */
  register(app: FastifyInstance, deps: ServerModuleDeps): void
}

export class ManifestError extends Error {
  override readonly name = 'ManifestError'
}

/**
 * Falha alto no boot em vez de deixar um módulo sombrear o outro em silêncio.
 *
 * Id duplicado é sempre bug de composição, e a mensagem de erro do
 * `collectMigrations` usa o id para apontar o culpado — dois módulos com o
 * mesmo nome tornariam essa mensagem inútil justamente quando ela é lida.
 */
export function assertManifest(modules: readonly ServerModule[]): void {
  if (modules.length === 0) {
    throw new ManifestError('manifest vazio: o servidor precisa de pelo menos um módulo')
  }

  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.id)) throw new ManifestError(`módulo duplicado no manifest: ${module.id}`)
    seen.add(module.id)
  }
}
