/**
 * Quebra uma linha de shell em palavras, respeitando aspas.
 *
 * Isto não é `split(' ')` porque o texto que as pessoas colam não é simples:
 * o corpo vem entre aspas e contém espaços, e o DevTools quebra linha com `\`.
 * É a maior superfície de teste deste pacote, e é por isso que ele nasce
 * separado do interpretador de flags — quebrar em palavras e decidir o que as
 * palavras significam são dois trabalhos.
 */
export class UnterminatedQuoteError extends Error {
  override readonly name = 'UnterminatedQuoteError'
  constructor(quote: string) {
    super(`o texto termina com uma aspa ${quote} aberta`)
  }
}

/** As sequências que o `$'...'` do bash resolve, e só elas. */
const ANSI_C_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  "'": "'",
  '"': '"',
  '\\': '\\',
}

function readAnsiC(raw: string, from: number): { text: string; index: number } {
  let text = ''
  for (let i = from; i < raw.length; i++) {
    const char = raw[i]!
    if (char === "'") return { text, index: i }
    if (char === '\\') {
      const next = raw[++i]
      // Escape que o bash não conhece passa literal, com a barra — é o que ele
      // mesmo faz, e inventar outra coisa mudaria o corpo que a pessoa colou.
      text += next === undefined ? '\\' : (ANSI_C_ESCAPES[next] ?? `\\${next}`)
      continue
    }
    text += char
  }
  throw new UnterminatedQuoteError("$'")
}

export function tokenize(raw: string): string[] {
  const tokens: string[] = []
  let current = ''
  let started = false
  let quote: "'" | '"' | null = null

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!

    if (quote) {
      if (char === quote) {
        quote = null
        continue
      }
      current += char
      started = true
      continue
    }

    // `$'...'` é a citação ANSI-C do bash, e é o que o DevTools emite quando o
    // corpo tem quebra de linha dentro. Tratar o `$` como caractere comum
    // deixaria um cifrão no começo do corpo.
    if (char === '$' && raw[i + 1] === "'") {
      const end = readAnsiC(raw, i + 2)
      current += end.text
      started = true
      i = end.index
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      started = true
      continue
    }

    if (char === '\\' && raw[i + 1] === '\n') {
      // A quebra de linha do DevTools: `\` seguido de newline junta as duas
      // linhas numa só, e não produz palavra.
      i++
      continue
    }

    if (/\s/.test(char)) {
      if (started) tokens.push(current)
      current = ''
      started = false
      continue
    }

    current += char
    started = true
  }

  if (quote) throw new UnterminatedQuoteError(quote)
  if (started) tokens.push(current)
  return tokens
}
