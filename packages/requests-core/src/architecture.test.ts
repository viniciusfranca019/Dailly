import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * As duas regras que definem este pacote, varridas em vez de combinadas.
 *
 * A primeira é o C5 pelo lado estrutural: **o modelo não conhece protocolo
 * nenhum**. O teste de comportamento prova que um driver inventado funciona;
 * este prova que ele funciona *porque* o núcleo é cego, e não porque o HTTP
 * abriu caminho para ele.
 *
 * A segunda é a fronteira da ADR 0011: esta é a metade **pura** do driver, e
 * ela não executa requisição nenhuma. O `tsconfig` sem a lib DOM já derruba um
 * `fetch` tipado; esta varredura pega o que tipo não vê — um import de
 * `node:http`, um `axios`, uma string.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url))
const SELF = 'architecture.test.ts'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const FILES = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).replaceAll('\\', '/'),
    code: readFileSync(path, 'utf8'),
  }))
  .filter((file) => file.path !== SELF)

const stripComments = (code: string) =>
  code.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')

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
 * O modelo: tudo que não é um driver nem um teste.
 *
 * Um driver **é** o lugar onde um protocolo pode ser nomeado — é literalmente o
 * trabalho dele. A regra é sobre o que fica de fora deles.
 */
/** Os protocolos que existem ou podem existir — o nome de uma pasta de driver. */
const PROTOCOLS = ['http', 'grpc', 'amqp', 'graphql', 'websocket']

/**
 * O modelo: tudo que não é driver nem teste — **em qualquer profundidade**.
 *
 * A versão anterior dizia isso na prosa e checava `!path.includes('/')`, ou
 * seja, só a raiz de `src/`. Um `storage/repository.ts` importando o driver
 * passava com a suíte inteira verde, e o gate provou isso contra a árvore de
 * verdade. Não era hipótese: o roadmap põe o `RequestRepository` neste pacote
 * na próxima feature, e ele é exatamente a primeira subpasta que não é driver.
 *
 * A camada é dita pelo primeiro segmento, com a lista de protocolos que já
 * existe — nenhum conceito novo.
 */
const isModel = (path: string): boolean => {
  if (path.endsWith('.test.ts')) return false
  const first = path.includes('/') ? path.slice(0, path.indexOf('/')) : ''
  return !PROTOCOLS.includes(first)
}

const MODEL = FILES.filter((file) => isModel(file.path))


/**
 * Um import de driver, nas quatro grafias que alcançam o mesmo arquivo.
 *
 * A versão anterior exigia a barra final, e o gate mostrou o preço: `'./http'`,
 * `'./http.js'` e a auto-referência pelo nome do pacote atravessavam a regra
 * intactas. Comparar o **último segmento**, com a extensão retirada, cobre as
 * quatro de uma vez — e não dispara em `node:http` nem em `./http-headers.js`,
 * que só contêm a palavra.
 */
const isDriverImport = (specifier: string): boolean => {
  if (specifier.startsWith('node:')) return false
  const last = specifier.split('/').pop() ?? ''
  const name = last.replace(/\.(js|ts)$/, '')
  if (PROTOCOLS.includes(name)) return true
  // `./http/index.js` — o penúltimo segmento é a pasta do driver.
  const segments = specifier.split('/')
  return segments.length > 1 && PROTOCOLS.includes(segments[segments.length - 2] ?? '')
}

describe('C5: o modelo não conhece protocolo nenhum', () => {
  it('encontra modelo para inspecionar (guarda contra varredura vazia)', () => {
    expect(FILES.length).toBeGreaterThan(8)
    expect(MODEL.length).toBeGreaterThan(3)
    expect(MODEL.map((file) => file.path)).toContain('registry.ts')
  })

  it('distingue as grafias de um import de driver, que são quatro', () => {
    // A primeira versão desta regra exigia barra depois do nome, e o gate a
    // furou: `'./http'`, `'./http.js'` e `'@dailly/requests-core/http'`
    // passavam intactos. Um deles foi provado contra a árvore de verdade — o
    // modelo importando o driver, cinco testes verdes.
    expect(isDriverImport('./http/index.js')).toBe(true)
    expect(isDriverImport('./http')).toBe(true)
    expect(isDriverImport('./http.js')).toBe(true)
    expect(isDriverImport('@dailly/requests-core/http')).toBe(true)
    expect(isDriverImport('../grpc/index.js')).toBe(true)

    // E o que não pode disparar: nomes que apenas contêm a palavra.
    expect(isDriverImport('node:http')).toBe(false)
    expect(isDriverImport('./http-headers.js')).toBe(false)
    expect(isDriverImport('./protocol.js')).toBe(false)
  })

  it('nenhum arquivo do modelo importa um driver', () => {
    // O registry recebe drivers; ele não vai buscar nenhum. No dia em que for,
    // registrar um protocolo deixa de ser um arquivo novo e vira uma edição no
    // núcleo — que é exatamente o que a ADR 0011 comprou ao escolher registry.
    const found = MODEL.flatMap((file) =>
      importsOf(file.code)
        .filter(isDriverImport)
        .map((specifier) => `${file.path} → ${specifier}`),
    )

    expect(found).toEqual([])
  })

  it('nenhum arquivo do modelo escreve o nome de um protocolo', () => {
    // Um `if (protocol === 'http')` não aparece no grafo de imports, e é a
    // forma mais provável de a cegueira se perder.
    const found = MODEL.flatMap((file) => {
      const clean = stripComments(file.code)
      return [...clean.matchAll(/['"`](http|https|grpc|amqp|graphql|ws|wss)['"`]/g)].map(
        (match) => `${file.path} → ${match[1]}`,
      )
    })

    expect(found).toEqual([])
  })
})

describe('a metade pura não executa nada', () => {
  const FORBIDDEN = [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dgram',
    'undici',
    'axios',
    'got',
    'node-fetch',
  ]

  it('nenhum arquivo importa um cliente de rede', () => {
    // Executar mora no servidor (ADR 0011), porque um renderer não consegue
    // mandar `Host`, `Origin` nem `Cookie`, e porque gRPC não existe num
    // webview. Um import de rede aqui é a metade errada do driver vazando para
    // dentro da metade que roda nos dois runtimes.
    const found = FILES.flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => FORBIDDEN.includes(specifier))
        .map((specifier) => `${file.path} → ${specifier}`),
    )

    expect(found).toEqual([])
  })

  it('nenhum arquivo de produção chama fetch', () => {
    // O `tsconfig` sem a lib DOM já derruba um `fetch` tipado. Esta regra pega
    // o que o tipo não vê: um acesso dinâmico, um `globalThis.fetch`.
    const found = FILES.filter((file) => !file.path.endsWith('.test.ts'))
      .filter((file) => /\bfetch\s*\(/.test(stripComments(file.code)))
      .map((file) => file.path)

    expect(found).toEqual([])
  })
})

describe('C5: a regra vale pela camada, não pelo lugar onde o arquivo calhou de ficar', () => {
  it('reconhece como modelo um arquivo em subpasta que não é de driver', () => {
    // A regra olhava só a raiz de `src/`, então um `storage/repository.ts`
    // importando o driver passava com a suíte inteira verde — provado pelo
    // gate contra a árvore de verdade. E `storage/` não é hipótese: o roadmap
    // põe o `RequestRepository` neste pacote na próxima feature, e ele é
    // exatamente a primeira subpasta que não é driver.
    expect(isModel('resolve.ts')).toBe(true)
    expect(isModel('storage/repository.ts')).toBe(true)
    expect(isModel('interpolate.ts')).toBe(true)

    // Um driver é o único lugar onde nomear um protocolo é o trabalho.
    expect(isModel('http/from-raw.ts')).toBe(false)
    expect(isModel('grpc/index.ts')).toBe(false)

    // Teste não é modelo: ele exercita o driver de propósito.
    expect(isModel('registry.test.ts')).toBe(false)
    expect(isModel('storage/repository.test.ts')).toBe(false)
  })
})
