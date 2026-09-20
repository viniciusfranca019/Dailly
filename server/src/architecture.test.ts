import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * C5 — a fronteira do servidor é testada, não combinada.
 *
 * A `ui/` tem o teste dela desde a ADR 0006; este é o mesmo princípio do outro
 * lado. Um servidor modularizado sem esta varredura é um servidor modularizado
 * por acordo, e acordo não falha no CI.
 *
 * Duas setas, e só duas:
 *
 * - o **shell** conhece o manifest, nunca um módulo;
 * - um **módulo** nunca alcança o interior de outro.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/**
 * Este arquivo, que a varredura não pode julgar.
 *
 * É a única fonte da árvore que contém especificadores deliberadamente errados:
 * as fixtures contra as quais as regras são provadas. Elas são dado, não
 * dependência — ninguém as importa — e deixá-las na varredura faria a suíte
 * falhar nos próprios exemplos.
 */
const SELF = 'architecture.test.ts'

const FILES = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).replaceAll('\\', '/'),
    code: readFileSync(path, 'utf8'),
  }))
  .filter((file) => file.path !== SELF)

const stripComments = (code: string) =>
  code.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')

/** Todo especificador que um arquivo puxa — estático, dinâmico e de efeito. */
function importsOf(code: string): string[] {
  const clean = stripComments(code)
  const specifiers: string[] = []
  for (const pattern of [
    /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
  ]) {
    for (const match of clean.matchAll(pattern)) specifiers.push(match[1]!)
  }
  return specifiers
}

/**
 * Para onde um import aponta, em caminho da árvore — e por que isto não é
 * casamento de texto.
 *
 * `../entries/validate.js`, escrito de dentro de `modules/requests/`, alcança
 * outro módulo sem conter a palavra `modules` em lugar nenhum. Um predicado
 * feito de regex sobre o especificador não vê essa escalada; um que resolve o
 * caminho antes de julgar vê. Foi o próprio teste que pegou isso, contra a
 * fixture abaixo, antes de a segunda pasta de módulo existir.
 */
const resolved = (from: string, specifier: string): string =>
  specifier.startsWith('.')
    ? join(dirname(from), specifier).replaceAll('\\', '/')
    : specifier.replace(/^@[^/]+\//, '')

/**
 * Entrar no diretório de módulos — e a distinção que carrega a regra inteira.
 *
 * `../modules.js` é o **manifest**, e é por ali que o shell tem que passar.
 * `../modules/entries/routes.js` é um **módulo**, e é o que ele não pode
 * conhecer. A barra depois de `modules` é a diferença entre as duas coisas.
 */
const intoAModule = (from: string, specifier: string) =>
  /(^|\/)modules\//.test(resolved(from, specifier))

/** O nome do módulo dono de um arquivo, ou `undefined` se o arquivo não é de módulo. */
const moduleOf = (path: string): string | undefined =>
  path.startsWith('modules/') ? path.split('/')[1] : undefined

/** Alcançar o interior de *outro* módulo: qualquer caminho que não o index dele. */
const intoAnotherModule = (from: string, specifier: string): boolean => {
  const target = /(?:^|\/)modules\/([^/]+)\/(.+)$/.exec(resolved(from, specifier))
  if (!target) return false
  const [, name, rest] = target
  if (name === moduleOf(from)) return false
  return rest !== 'index.js' && rest !== 'index.ts'
}

/**
 * Entrar no shell por qualquer porta que não seja o contrato.
 *
 * `shell/module.js` é a superfície: é por ele que um módulo declara o que é.
 * `shell/migrations.js`, `shell/database.js`, `shell/config.js` e
 * `shell/app.js` são o interior — e o primeiro deles calcula `MIGRATIONS` a
 * partir do manifest, então um módulo que o importe fecha o ciclo
 * `shell/migrations → modules → modules/entries → shell/migrations`.
 *
 * O ciclo é seguro hoje porque toda seta de volta é `import type` e some na
 * compilação. Esta regra é o que transforma "seguro por acidente" em "seguro
 * por regra que falha no CI" — que é a diferença de que este repo vive.
 */
const intoTheShell = (from: string, specifier: string): boolean => {
  const target = /(?:^|\/)shell\/(.+)$/.exec(resolved(from, specifier))
  if (!target) return false
  return target[1] !== 'module.js' && target[1] !== 'module.ts'
}

describe('C5: a seta do servidor só aponta para onde pode', () => {
  it('encontra fonte para inspecionar (guarda contra uma varredura vazia em silêncio)', () => {
    // Toda regra abaixo vale o tamanho desta lista. Uma varredura que não
    // achasse nada passaria em tudo e não provaria nada.
    expect(FILES.length).toBeGreaterThan(10)
    expect(FILES.filter((file) => file.path.startsWith('shell/')).length).toBeGreaterThan(3)
    expect(FILES.filter((file) => file.path.startsWith('modules/')).length).toBeGreaterThan(3)
  })

  it('distingue o manifest de um módulo, que é a regra inteira', () => {
    // Provado contra fonte deliberadamente errada, porque uma regra que só roda
    // contra uma árvore limpa passa por dois motivos e não separa nenhum: ou o
    // código está certo, ou a varredura não viu.
    expect(intoAModule('shell/migrations.ts', '../modules.js')).toBe(false)
    expect(intoAModule('index.ts', './modules.js')).toBe(false)
    expect(intoAModule('shell/app.ts', '../modules/entries/routes.js')).toBe(true)
    expect(intoAModule('index.ts', './modules/entries/index.js')).toBe(true)
  })

  it('distingue o index público de um módulo do interior dele', () => {
    const from = 'modules/requests/routes.ts'
    expect(intoAnotherModule(from, '../entries/index.js')).toBe(false)
    expect(intoAnotherModule(from, '../../modules/entries/index.js')).toBe(false)
    // A escalada por caminho irmão, que não contém a palavra `modules`: é ela
    // que obriga o predicado a resolver o caminho em vez de ler o texto.
    expect(intoAnotherModule(from, '../entries/sqlite-entry-repository.js')).toBe(true)
    expect(intoAnotherModule(from, '../../modules/entries/validate.js')).toBe(true)
    // Dentro do próprio módulo, caminho fundo é a forma normal de importar.
    expect(intoAnotherModule('modules/entries/index.ts', '../../modules/entries/routes.js')).toBe(
      false,
    )
  })

  it('distingue o contrato do shell do interior dele', () => {
    const from = 'modules/entries/index.ts'
    expect(intoTheShell(from, '../../shell/module.js')).toBe(false)
    expect(intoTheShell(from, '../../shell/migrations.js')).toBe(true)
    expect(intoTheShell(from, '../../shell/database.js')).toBe(true)
    expect(intoTheShell(from, '../../shell/config.js')).toBe(true)
    // Dentro do próprio shell, tudo é caminho normal.
    expect(intoTheShell('shell/app.ts', './module.js')).toBe(false)
    expect(intoTheShell('shell/database.ts', './migrations.js')).toBe(true)
  })

  it('um módulo alcança o shell só pelo contrato', () => {
    // A seta de volta que sobra é `shell/module.js`, e ela é só tipo. O que
    // esta regra impede é um módulo pendurado no arquivo que lê o manifest —
    // o ciclo que hoje só não morde porque `import type` some na compilação.
    const found = FILES.filter((file) => file.path.startsWith('modules/')).flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => intoTheShell(file.path, specifier))
        .map((specifier) => `${file.path} → ${specifier}`),
    )

    expect(found).toEqual([])
  })

  it('o shell conhece o manifest, nunca um módulo', () => {
    // O laço que monta as rotas recebe a lista; ele não sabe o nome de ninguém.
    // No dia em que souber, o manifest virou decoração e a flag de módulo
    // deixou de significar alguma coisa.
    const found = FILES.filter((file) => file.path.startsWith('shell/')).flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => intoAModule(file.path, specifier))
        .map((specifier) => `${file.path} → ${specifier}`),
    )

    expect(found).toEqual([])
  })

  it('um módulo alcança outro só pelo index público dele', () => {
    const found = FILES.flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => intoAnotherModule(file.path, specifier))
        .map((specifier) => `${file.path} → ${specifier}`),
    )

    expect(found).toEqual([])
  })
})
