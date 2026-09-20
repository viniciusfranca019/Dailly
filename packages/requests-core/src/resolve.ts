import { type Env, interpolate } from './interpolate.js'
import type { Invalid, ProtocolSpec, WireRequest } from './protocol.js'
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

export class InvalidSpecError extends Error {
  override readonly name = 'InvalidSpecError'
  constructor(
    readonly protocol: string,
    readonly errors: readonly Invalid[],
  ) {
    super(
      `o spec não é válido para o protocolo ${protocol}: ` +
        errors.map((error) => `${error.field} ${error.message}`).join('; '),
    )
  }
}

/** O que sobrou parecendo variável depois da substituição. */
const SURVIVING = /\{\{\s*([^}\s]+)\s*\}\}/g

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

  // A substituição é de uma passada só. Uma variável cujo **valor** traz outra
  // — `{{baseUrl}}` = `{{scheme}}://{{host}}`, rotina nesta classe de
  // ferramenta — deixaria a segunda camada intacta e a mandaria para a rede.
  //
  // A resposta não é recursão: resolver em cadeia exige detectar ciclo, e o
  // valor disso não está provado por nenhum uso. A resposta é olhar o
  // resultado: se sobrou algo com cara de chave, recusa. Custa uma varredura e
  // fecha o buraco inteiro, venha ele de onde vier.
  const survivors = [...JSON.stringify(value).matchAll(SURVIVING)].map((match) => match[1]!)
  const unresolved = [...new Set([...missing, ...survivors])]
  if (unresolved.length > 0) throw new UnresolvedVariableError(unresolved)

  const validated = driver.validate(value)
  if ('errors' in validated) throw new InvalidSpecError(request.protocol, validated.errors)

  return driver.toWire(validated.spec) as W
}
