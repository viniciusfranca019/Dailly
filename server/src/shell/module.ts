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
import type { Database } from 'better-sqlite3'
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

/** O que o composition root oferece a um módulo que constrói a própria dependência. */
export interface ProvideContext {
  readonly db: Database
  readonly zone: TimeZone
}

interface ServerModuleBase {
  /** Identidade estável, usada no manifest e nas mensagens de erro. */
  readonly id: string
  /**
   * A fatia deste módulo no `user_version`, que é uma sequência **global**.
   *
   * O módulo escolhe os números; `collectMigrations` recusa colisão. A
   * coordenação entre módulos é manual, e a asserção é o que a torna segura.
   */
  readonly migrations: readonly Migration[]
}

/**
 * `TOwn` é união discriminada, e não um parâmetro solto, por uma razão que o
 * gate encontrou: com um tipo só, `ServerModule<RequestStore>` compilava sem
 * `provide` — e aí o `register` recebia `undefined` tipado como `RequestStore`,
 * estourando na primeira rota. Declarar o tipo e esquecer de construí-lo
 * deixou de ser expressável.
 *
 * Guardado alargado como `unknown` na lista, o mesmo idioma do `BlockRegistry`:
 * o shell trata os módulos de forma uniforme enquanto cada um continua
 * estritamente tipado no próprio arquivo.
 */
export type ServerModule<TOwn = void> = [TOwn] extends [void]
  ? ServerModuleBase & {
      provide?: undefined
      register(app: FastifyInstance, deps: ServerModuleDeps, own: void): void
    }
  : ServerModuleBase & {
      /**
       * A dependência que é **só deste módulo**, construída por ele.
   *
   * Esta é a abstração que a [ADR 0006, Emenda 2](../../../docs/adrs/0006-modularizacao-frontend.md)
   * adiou com gatilho nomeado, e o gatilho é o módulo Requests. Sem ela, cada
   * módulo novo acrescentaria um campo ao `ServerModuleDeps` — o tell da Lei 4
   * — e o entries passaria a enxergar o store de requests sem precisar dele.
   *
       * **Ausente no entries de propósito:** o repositório dele é construído
       * pelo composition root e entregue no saco, porque o teste do 501 injeta
       * um `entries` diferente a cada `buildApp` e isso precisa continuar
       * possível.
       */
      provide(context: ProvideContext): TOwn
      register(app: FastifyInstance, deps: ServerModuleDeps, own: TOwn): void
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
export function assertManifest(modules: readonly AnyServerModule[]): void {
  if (modules.length === 0) {
    throw new ManifestError('manifest vazio: o servidor precisa de pelo menos um módulo')
  }

  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.id)) throw new ManifestError(`módulo duplicado no manifest: ${module.id}`)
    seen.add(module.id)
  }
}

/**
 * A forma **alargada** em que o shell guarda qualquer módulo.
 *
 * Dois tipos para dois trabalhos, como no `BlockRegistry`: `ServerModule<T>` é
 * para **escrever** um módulo, e é ele que amarra "declara `TOwn`" a "tem
 * `provide`"; este é para **guardar** uma lista heterogênea, onde o shell
 * trata todos igual. Usar o de autoria como tipo de lista obrigaria todo
 * módulo a ter `provide` — que é o oposto do que a união existe para dizer.
 */
export type AnyServerModule = ServerModuleBase & {
  provide?(context: ProvideContext): unknown
  register(app: FastifyInstance, deps: ServerModuleDeps, own: unknown): void
}

/**
 * A única porta para a lista — e o motivo de ela existir.
 *
 * `AnyServerModule` é tipo de **armazenamento**: ele alarga `TOwn` para
 * `unknown`, e como `register` é método, a bivariância do TypeScript aceita
 * `own: RequestStore` onde `own: unknown` está declarado. Consequência: um
 * literal anotado direto como `AnyServerModule` volta a poder declarar uma
 * dependência que nunca constrói — exatamente o buraco que a união fechou.
 *
 * Isso é inerente a um tipo alargado, não conserto possível nele. O conserto é
 * não deixar ninguém anotar com ele: passando por aqui, a checagem acontece no
 * tipo de autoria e o alargamento vira consequência, não escolha.
 */
export const defineModule = <TOwn>(module: ServerModule<TOwn>): AnyServerModule =>
  module as AnyServerModule
