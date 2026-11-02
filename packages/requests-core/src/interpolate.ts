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

import { placeholderPattern, placeholdersIn } from './placeholder.js'

export interface Interpolated<T> {
  readonly value: T
  readonly missing: readonly string[]
}

/**
 * As chaves que sobraram num valor, campo a campo.
 *
 * Caminhar a árvore e não o JSON serializado: varrer o texto serializado deixa
 * o padrão comer **através** da fronteira entre campos, e aí a recusa nomeia
 * uma variável que ninguém escreveu — ou pior, recusa uma requisição sem
 * variável nenhuma, quando um campo termina em `{{` e o seguinte começa em
 * `}}`.
 */
export function placeholdersOf(value: unknown): string[] {
  const found = new Set<string>()
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      for (const name of placeholdersIn(node)) found.add(name)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node !== null && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(value)
  return [...found]
}

export function interpolate<T>(value: T, env: Env): Interpolated<T> {
  const missing = new Set<string>()

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.replaceAll(placeholderPattern(), (whole, name: string) => {
        // `Object.hasOwn` e não `in`: `in` percorre o prototype, e
        // `{{constructor}}` resolvia para o código-fonte de `Object` — sem
        // reclamar, e daí direto para a fita. E não é `??` porque uma variável
        // declarada como string vazia é um valor que alguém escolheu, não uma
        // ausência: tratá-la como ausente obrigaria a pessoa a inventar um
        // texto para dizer "nenhum".
        if (Object.hasOwn(env, name)) return env[name]!
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

/**
 * Onde começa e termina cada string literal de um texto JSON — `[início, fim)`,
 * aspas incluídas. Barra invertida pula o caractere seguinte, então `\"` não
 * fecha nada.
 */
const stringRanges = (text: string): (readonly [number, number])[] => {
  const ranges: (readonly [number, number])[] = []
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (start >= 0 && char === '\\') i++
    else if (char === '"') {
      if (start < 0) start = i
      else {
        ranges.push([start, i + 1])
        start = -1
      }
    }
  }
  return ranges
}

/** `{` ou `[` no começo: tem cara de JSON, e o escape vale. */
const looksJson = (text: string) => /^\s*[[{]/.test(text)

/**
 * Como `interpolate` sobre um texto, mas consciente de JSON.
 *
 * Um valor que cai **dentro** de uma string JSON entra escapado: um segredo
 * com `"` ou `\` quebrava o corpo em silêncio, e o servidor do outro lado
 * respondia 400 sem dizer por quê. Fora de string ele entra cru, porque
 * `{"n": {{n}}}` é o jeito de mandar número. Texto que não tem cara de JSON
 * recebe a interpolação de sempre.
 */
export function interpolateJsonText(text: string, env: Env): Interpolated<string> {
  if (!looksJson(text)) return interpolate(text, env)
  const ranges = stringRanges(text)
  const inString = (offset: number) => ranges.some(([from, to]) => offset > from && offset < to)
  const missing = new Set<string>()
  const value = text.replaceAll(placeholderPattern(), (whole, name: string, offset: number) => {
    if (!Object.hasOwn(env, name)) {
      missing.add(name)
      return whole
    }
    const raw = env[name]!
    return inString(offset) ? JSON.stringify(raw).slice(1, -1) : raw
  })
  return { value, missing: [...missing] }
}
