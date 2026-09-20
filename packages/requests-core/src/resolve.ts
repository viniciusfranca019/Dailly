import { type Env, interpolate, placeholdersOf } from './interpolate.js'
import type { Invalid, ProtocolSpec, WireRequest } from './protocol.js'
import type { ProtocolRegistry } from './registry.js'

/**
 * A requisição não pôde ser montada — por uma de duas razões, que são
 * diferentes e por isso vêm separadas.
 *
 * **Ausente** é a variável que o ambiente não tem: a pessoa acrescenta e
 * resolve. **Sobrevivente** é a que apareceu *depois* da substituição, porque
 * o valor de outra variável a continha — e aí acrescentá-la não resolve nada,
 * porque ela já está lá. Uma mensagem só para as duas mandava a pessoa
 * acrescentar uma variável que existia, e não sobrava nada para tentar.
 */
export class UnresolvedVariableError extends Error {
  override readonly name = 'UnresolvedVariableError'

  constructor(
    readonly missing: readonly string[],
    readonly surviving: readonly string[] = [],
  ) {
    super(
      [
        'a requisição não pode ser montada:',
        missing.length > 0
          ? `${missing.length === 1 ? 'a variável' : 'as variáveis'} ${missing.join(', ')} ` +
            `não ${missing.length === 1 ? 'tem' : 'têm'} valor no ambiente.`
          : '',
        surviving.length > 0
          ? `sobrou ${surviving.map((name) => `{{${name}}}`).join(', ')} depois da substituição — ` +
            'o valor de uma variável não resolve outra.'
          : '',
      ]
        .filter((part) => part !== '')
        .join(' '),
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
  // O que sobrou é de outra natureza que o que faltou, e a mensagem precisa
  // dizer qual é qual: uma chave que sobreviveu à substituição pode ter valor
  // no ambiente — ela só apareceu tarde demais.
  const survivors = placeholdersOf(value)
  // Quem faltava também sobrevive no texto — a chave continua lá justamente
  // porque não havia com o que trocá-la. A subtração é no outro sentido: o que
  // sobrou *sem* ter faltado é o que apareceu tarde, através do valor de
  // outra.
  const surviving = survivors.filter((name) => !missing.includes(name))
  if (missing.length > 0 || surviving.length > 0) {
    throw new UnresolvedVariableError(missing, surviving)
  }

  const validated = driver.validate(value)
  if ('errors' in validated) throw new InvalidSpecError(request.protocol, validated.errors)

  return driver.toWire(validated.spec) as W
}
