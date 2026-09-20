import type { EntryRepository } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'
import type { FastifyInstance } from 'fastify'
import type { Migration } from './migrations.js'

/**
 * O contrato de módulo do servidor — o gêmeo do `ModuleDescriptor` da `ui/`.
 *
 * A ADR 0006 decidiu duas camadas no frontend e escreveu o critério de entrada
 * em cada uma. Esta é a mesma decisão aplicada ao outro lado: o shell não sabe
 * o nome de módulo nenhum, lê o manifest e monta o que estiver lá.
 *
 * Diferença deliberada em relação à `ui/`: **não há flag de build aqui**. Uma
 * rota desligada não custa bytes no bundle de ninguém, e uma flag de runtime no
 * servidor criaria exatamente a divergência ui/server que as flags existem para
 * evitar — um build do renderer sem Analyse falando com uma API que o tem.
 */
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
