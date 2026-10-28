/**
 * `NOME=valor`, uma por linha — o formato que todo mundo já digitou.
 *
 * Uma tabela com linhas de adicionar e remover seria a forma que Postman usa e
 * é mais UI para o mesmo dado; um `.env` colado funciona de primeira e cabe
 * num `<textarea>`. Se um dia precisar de tipo por variável, aí a tabela se
 * paga.
 */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue

    const at = line.indexOf('=')
    if (at === -1) continue

    const name = line.slice(0, at).trim()
    // Sem nome não há variável — e gravar `''` como chave faria o `resolve`
    // procurar um `{{}}` que não existe.
    if (name === '') continue

    // O valor **não** é aparado: uma senha que termina em espaço é uma senha
    // que termina em espaço, e aparar faria sair na fita algo diferente do que
    // está escrito na tela.
    env[name] = line.slice(at + 1)
  }
  return env
}
