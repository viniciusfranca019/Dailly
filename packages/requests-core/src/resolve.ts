import { type Env, interpolate } from './interpolate.js'
import type { ProtocolSpec, WireRequest } from './protocol.js'
import type { ProtocolRegistry } from './registry.js'

export class UnresolvedVariableError extends Error {
  override readonly name = 'UnresolvedVariableError'
  constructor(missing: readonly string[]) {
    super(
      `a requisição não pode ser montada: ${missing.length === 1 ? 'a variável' : 'as variáveis'} ` +
        `${missing.join(', ')} não ${missing.length === 1 ? 'tem' : 'têm'} valor no ambiente.`,
    )
  }
}

/**
 * O spec, mais o ambiente, viram a requisição literal — sem hop nenhum.
 *
 * É esta função que sustenta a recusa do híbrido na
 * [ADR 0011](../../../docs/adrs/0011-requests-modulo-e-execucao.md): a única
 * virtude de "o servidor monta o estado e a UI executa" era ver exatamente o
 * que vai ser enviado, e isso é puro, roda no renderer, e não custa viagem.
 *
 * **Faltando variável, ele recusa.** É o bug que todo cliente de API tem: a
 * variável vazia vira texto e a requisição sai com `Bearer {{token}}`. O
 * servidor responde 401, e a pessoa vai procurar o erro na autenticação.
 */
export function resolve<W extends WireRequest = WireRequest>(
  registry: ProtocolRegistry,
  request: ProtocolSpec,
  env: Env,
): W {
  const driver = registry.get(request.protocol)
  const { value, missing } = interpolate(request.spec, env)
  if (missing.length > 0) throw new UnresolvedVariableError(missing)

  const validated = driver.validate(value)
  if ('errors' in validated) {
    throw new Error(
      `o spec não é válido para o protocolo ${request.protocol}: ` +
        validated.errors.map((error) => `${error.field} ${error.message}`).join('; '),
    )
  }

  return driver.toWire(validated.spec) as W
}
