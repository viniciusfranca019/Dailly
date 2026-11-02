/**
 * O ponto de entrada do `make import-apidog FILE=...` — uma folha, como o `dev.ts`.
 *
 * Os ids são UUID aqui, na raiz do processo, como na raiz da UI.
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { runImport } from './import-apidog.js'

const file = process.argv[2]
if (!file) {
  console.error('uso: make import-apidog FILE=caminho/do/export.json')
  process.exit(2)
}

const baseUrl = process.env['DAILLY_URL'] ?? 'http://127.0.0.1:4318'

try {
  const collection = JSON.parse(await readFile(file, 'utf8')) as unknown
  const report = await runImport({ collection, baseUrl, nextId: randomUUID })

  console.log(`importado em ${baseUrl}: ${report.folders} pastas, ${report.requests} requests.`)
  if (report.variables.length > 0) {
    console.log(`\nvariáveis usadas (cadastre os valores no cofre, nunca na request):`)
    for (const name of report.variables) console.log(`  {{${name}}}`)
  }
  if (report.literalSecrets.length > 0) {
    console.log('\ncredenciais escritas direto, trocadas por variável:')
    for (const s of report.literalSecrets) console.log(`  ${s.path} · ${s.field} → {{${s.variable}}}`)
  }
  if (report.skipped.length > 0) {
    console.log('\nficaram de fora:')
    for (const s of report.skipped) console.log(`  ${s.path} — ${s.reason}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
