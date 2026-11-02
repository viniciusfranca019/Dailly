import { type Env, type Interpolated, interpolate } from '../interpolate.js'
import { placeholderPattern } from '../placeholder.js'

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
