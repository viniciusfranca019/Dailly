/**
 * A sintaxe de uma chave, escrita **uma vez** e no modelo.
 *
 * Ela estava copiada em três arquivos, e o tell da Lei 2 aqui é literalmente a
 * história deste pacote: mude o que é aceito num deles e o `hasPlaceholder`
 * passa a discordar em silêncio do `interpolate` — que é a forma exata do
 * defeito que a regra do placeholder existe para encerrar.
 *
 * Mora no modelo e não no driver porque o que é uma variável é do pacote, não
 * do protocolo — a mesma razão pela qual a interpolação é genérica. O driver
 * usa daqui; o inverso é a seta que o `architecture.test.ts` proíbe, e foi ele
 * quem apontou quando tentei o contrário.
 */
export const PLACEHOLDER_SOURCE = '\\{\\{\\s*([^}\\s]+)\\s*\\}\\}'

/** Nova a cada chamada: uma regex global carrega `lastIndex` entre usos. */
export const placeholderPattern = (): RegExp => new RegExp(PLACEHOLDER_SOURCE, 'g')

export const hasPlaceholder = (text: string): boolean =>
  new RegExp(PLACEHOLDER_SOURCE).test(text)

/** Os nomes das chaves de um texto, sem passar por serialização nenhuma. */
export const placeholdersIn = (text: string): string[] =>
  [...text.matchAll(placeholderPattern())].map((match) => match[1]!)
