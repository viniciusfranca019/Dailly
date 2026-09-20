/**
 * Base64, escrito à mão porque este pacote não tem onde pegar um pronto.
 *
 * `btoa` mora na lib DOM e `Buffer` nos tipos do Node, e o `tsconfig` daqui não
 * carrega nenhum dos dois — de propósito, porque este é o núcleo puro que roda
 * nos **dois** runtimes. Vinte linhas é o preço de não escolher um deles.
 *
 * UTF-8 primeiro, e isso não é zelo: uma senha com acento passada em `-u`
 * viraria base64 de code points, que é outro texto.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function utf8Bytes(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
  }
  return bytes
}

export function toBase64(text: string): string {
  const bytes = utf8Bytes(text)
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i]!
    const second = bytes[i + 1]
    const third = bytes[i + 2]

    out += ALPHABET[first >> 2]
    out += ALPHABET[((first & 0b11) << 4) | ((second ?? 0) >> 4)]
    out += second === undefined ? '=' : ALPHABET[((second & 0b1111) << 2) | ((third ?? 0) >> 6)]
    out += third === undefined ? '=' : ALPHABET[third & 0b111111]
  }

  return out
}
