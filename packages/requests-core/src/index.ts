/**
 * Requests — o modelo: texto cru → `ProtocolSpec` → o que sai na fita.
 *
 * **Onde este código roda, porque o próximo leitor vai chutar errado.** Nos
 * dois runtimes, e é por isso que ele é um pacote e não uma pasta da `ui/`:
 * o renderer o usa para importar um curl e mostrar o preview; o servidor o usa
 * para validar o que recebe antes de executar
 * ([ADR 0011](../../../docs/adrs/0011-requests-modulo-e-execucao.md)).
 *
 * **O que ele deliberadamente não faz: executar.** Essa metade mora no
 * `server/`, porque um renderer não consegue mandar `Host`, `Origin` nem
 * `Cookie`, porque CORS devolve resposta opaca a partir de `file://`, e porque
 * gRPC não existe num webview. Aqui não há `fetch`, e isso é imposto de duas
 * formas: o `tsconfig` não carrega a lib DOM, e o `architecture.test.ts` varre
 * o que o tipo não vê.
 *
 * **O ponto de extensão é o `ProtocolRegistry`**, na forma do `BlockRegistry`
 * do whiteboard-core: acrescentar gRPC ou AMQP é um arquivo novo mais um
 * `register()`, nunca uma edição aqui. O modelo não escreve o nome de
 * protocolo nenhum, e o teste de arquitetura falha se escrever.
 *
 * **Por isso os drivers não saem por aqui.** Cada protocolo tem o seu subpath
 * — `@dailly/requests-core/http` hoje, `/grpc` amanhã — e nenhum é
 * privilegiado. Reexportar o HTTP daqui o faria entrar pela porta da frente
 * enquanto os outros entram pela lateral, e foi o próprio teste de arquitetura
 * que apontou isso quando eu tentei. Mesmo padrão do `@dailly/domain`, que
 * expõe `./testing` como subpath em vez de misturá-lo ao índice.
 */

export type { ProtocolSpec, ProtocolDriver, WireRequest, Invalid, Imported } from './protocol.js'

export { ProtocolRegistry, UnknownProtocolError } from './registry.js'

export { resolve, UnresolvedVariableError, InvalidSpecError } from './resolve.js'
export { interpolate } from './interpolate.js'
export type { Env, Interpolated } from './interpolate.js'
