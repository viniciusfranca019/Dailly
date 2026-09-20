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
 * O que um módulo pode alcançar fora de si — dito como lista branca, e o
 * motivo de ser branca.
 *
 * A primeira versão desta regra nomeava o proibido: "não entre em `shell/`
 * fora do contrato". O gate a furou com um `../` a mais — `index.js`, o
 * composition root, reexporta `openDatabase`, `MIGRATIONS` e `migrate`, então
 * o interior do shell continuava alcançável por uma porta que a regra não
 * nomeava. E era pior que o ciclo original: ali toda aresta é import de
 * **valor**, então o boot morre de verdade, com `MODULES` ainda indefinido, e
 * o stack acusa `shell/migrations.ts` — a vítima, não o culpado.
 *
 * Lista de proibidos envelhece a cada arquivo novo. Lista branca não: o que
 * um módulo legitimamente alcança são três coisas, e elas não crescem.
 */
const OUT_OF_MODULE = ['shell/module.js', 'shell/module.ts']

const illegalFromModule = (from: string, specifier: string): string | undefined => {
  // Especificador não-relativo é pacote (`fastify`, `@dailly/domain`), e
  // pacote é sempre legítimo — a fronteira desta regra é a árvore, não o npm.
  if (!specifier.startsWith('.')) return undefined

  const self = moduleOf(from)
  if (self === undefined) return undefined

  const target = resolved(from, specifier)

  // 1. Dentro do próprio módulo, caminho fundo é a forma normal de importar.
  if (target.startsWith(`modules/${self}/`)) return undefined
  // 2. O contrato do shell — a única porta de entrada, e só tipo.
  if (OUT_OF_MODULE.includes(target)) return undefined
  // 3. O index público de outro módulo, que é o que o C5 permite.
  const other = /^modules\/([^/]+)\/(.+)$/.exec(target)
  if (other && (other[2] === 'index.js' || other[2] === 'index.ts')) return undefined

  return target
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

  it('sabe o que um módulo pode alcançar fora de si, e o que não pode', () => {
    const from = 'modules/entries/routes.ts'

    // Permitido
    expect(illegalFromModule(from, './validate.js')).toBeUndefined()
    expect(illegalFromModule(from, '../../shell/module.js')).toBeUndefined()
    expect(illegalFromModule(from, '../outro/index.js')).toBeUndefined()
    expect(illegalFromModule(from, 'fastify')).toBeUndefined()
    expect(illegalFromModule(from, '@dailly/domain')).toBeUndefined()

    // Proibido — o interior do shell, por qualquer porta
    expect(illegalFromModule(from, '../../shell/config.js')).toBe('shell/config.js')
    expect(illegalFromModule(from, '../../shell/migrations.js')).toBe('shell/migrations.js')
    // A porta que o gate achou: o composition root reexporta o shell inteiro.
    expect(illegalFromModule(from, '../../index.js')).toBe('index.js')
    // O manifest, que carrega todos os módulos.
    expect(illegalFromModule(from, '../../modules.js')).toBe('modules.js')
    // O interior de outro módulo, e o adapter que saiu de dentro deles.
    expect(illegalFromModule(from, '../outro/validate.js')).toBe('modules/outro/validate.js')
    expect(illegalFromModule(from, '../../adapters/sqlite-entry-repository.js')).toBe(
      'adapters/sqlite-entry-repository.js',
    )
  })

  it('um módulo só alcança o que a lista branca permite', () => {
    const found = FILES.flatMap((file) =>
      importsOf(file.code)
        .map((specifier) => illegalFromModule(file.path, specifier))
        .filter((target): target is string => target !== undefined)
        .map((target) => `${file.path} → ${target}`),
    )

    expect(found).toEqual([])
  })

  it('fora de modules/, só o manifest importa um módulo', () => {
    // A regra valia só para `shell/` e isentava justamente o arquivo que fazia
    // o que ela proíbe: o composition root importava o adapter *através* do
    // módulo. Com o adapter em `adapters/`, ela passa a valer para a árvore
    // inteira, que é o que o C3 diz — "o shell não importa o módulo em lugar
    // nenhum", não "nenhum arquivo sob shell/".
    const found = FILES.filter(
      (file) => !file.path.startsWith('modules/') && file.path !== 'modules.ts',
    ).flatMap((file) =>
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
