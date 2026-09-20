/**
 * Onde um `{{placeholder}}` está, para que nada seja decidido em cima dele.
 *
 * O importador toma decisões sobre o **texto literal** dos valores: o
 * `--data-urlencode` codifica em volta do `=`, o `-u` corta no `:`, o `-b`
 * decide por `=`. Toda decisão dessas tomada sobre uma chave é tomada sobre o
 * texto errado, e o estrago é sempre o mesmo: a chave deixa de parecer uma
 * chave, o `resolve()` não tem o que recusar, e a requisição sai disfarçada.
 *
 * Aconteceu duas vezes — o `-u` em base64, o `--data-urlencode` em
 * percent-encoding — antes de virar uma regra em vez de dois remendos.
 */
const PLACEHOLDER = /\{\{\s*[^}\s]+\s*\}\}/

export const hasPlaceholder = (text: string): boolean => PLACEHOLDER.test(text)

/**
 * O índice de um delimitador que está **fora** de qualquer chave, ou -1.
 *
 * `-u '{{user}}:{{senha}}'` tem um `:` de fora, e cortar nele está certo.
 * `-u '{{cred}}'` não tem nenhum: cortar ali inventaria um corte, e o `:` de
 * verdade só vai existir depois que a variável for resolvida.
 */
export function indexOutsidePlaceholder(text: string, delimiter: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i)) {
      depth++
      i++
      continue
    }
    if (text.startsWith('}}', i)) {
      if (depth > 0) depth--
      i++
      continue
    }
    if (depth === 0 && text[i] === delimiter) return i
  }
  return -1
}
