/**
 * Troca `{{variável}}` por valor, em qualquer string, em qualquer profundidade.
 *
 * **Genérico de propósito.** Poderia ser trabalho do driver, e aí cada
 * protocolo novo reimplementaria a mesma substituição — cada um com o seu bug,
 * e nenhum deles testado como este. O driver decide o que é uma requisição; o
 * que é uma variável é do pacote.
 *
 * Ele coleta o que falta em vez de estourar na primeira: quem tem três
 * variáveis por configurar prefere saber as três de uma vez a descobrir uma por
 * execução.
 */
export type Env = Readonly<Record<string, string>>

const VARIABLE = /\{\{\s*([^}\s]+)\s*\}\}/g

export interface Interpolated<T> {
  readonly value: T
  readonly missing: readonly string[]
}

export function interpolate<T>(value: T, env: Env): Interpolated<T> {
  const missing = new Set<string>()

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.replaceAll(VARIABLE, (whole, name: string) => {
        // `in` e não `??`: uma variável declarada como string vazia é um valor
        // que alguém escolheu, não uma ausência. Tratá-la como ausente
        // obrigaria a pessoa a inventar um texto para dizer "nenhum".
        if (name in env) return env[name]!
        missing.add(name)
        return whole
      })
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item)]))
    }
    return node
  }

  return { value: walk(value) as T, missing: [...missing] }
}
