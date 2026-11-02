import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * As regras do que mora na raiz e não é código: a versão (SemVer, `VERSION` +
 * `CHANGELOG.md`) e o bundle OKF de `docs/`. Nenhum projeto as enxerga, pela
 * mesma razão do `architecture.test.ts`: elas valem para o repo inteiro.
 *
 * O registro de tipos e campos é `docs/conventions/okf.md`; a regra de versão,
 * `docs/conventions/versioning.md`.
 */

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const DOCS = join(ROOT, 'docs')
const read = (path: string) => readFileSync(path, 'utf8')

describe('a versão tem uma fonte só, e o changelog a acompanha', () => {
  const version = () => read(join(ROOT, 'VERSION')).trim()

  it('VERSION é X.Y.Z', () => {
    expect(version()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('o CHANGELOG.md guarda só a versão atual, a mesma de VERSION', () => {
    const changelog = read(join(ROOT, 'CHANGELOG.md'))
    expect(changelog.split('\n')[0]).toBe(`version: ${version()}`)
    // As anteriores ficam no `git log -p CHANGELOG.md`, não no arquivo.
    expect(changelog.match(/^version: /gm)).toHaveLength(1)
    expect(changelog).toMatch(/^- /m)
  })
})

/** Todo `.md` do bundle, pelo caminho a partir de `docs/` (`/conventions/okf.md`). */
function bundle(dir = DOCS): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return bundle(path)
    return entry.name.endsWith('.md') ? [`/${relative(DOCS, path).replaceAll('\\', '/')}`] : []
  })
}

const RESERVED = ['index.md', 'log.md']
const isConcept = (path: string) => !RESERVED.includes(path.split('/').at(-1)!)
const concepts = () => bundle().filter(isConcept)

/** O frontmatter como `chave → valor cru` de primeiro nível; `null` sem frontmatter. */
function frontmatter(path: string): Map<string, string> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(read(join(DOCS, path)))
  if (!match) return null
  const keys = new Map<string, string>()
  for (const line of match[1]!.split('\n')) {
    const key = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (key) keys.set(key[1]!, key[2]!)
  }
  return keys
}

/** Os tipos da tabela "Tipos" do registro: as linhas que começam com `` | `Tipo` ``. */
function registeredTypes(): string[] {
  const section = read(join(DOCS, 'conventions/okf.md')).split(/^# /m).find((s) => s.startsWith('Tipos'))
  return [...(section ?? '').matchAll(/^\|\s*`([A-Za-z]+)`/gm)].map((m) => m[1]!)
}

/** Os destinos de link Markdown do arquivo, sem âncora, fora os externos. */
const links = (path: string) =>
  [...read(join(DOCS, path)).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]!.split('#')[0]!)
    .filter((target) => target !== '' && !/^[a-z]+:/.test(target))

describe('docs/ é um bundle OKF', () => {
  it('acha conceitos para inspecionar (guarda contra uma varredura vazia)', () => {
    expect(concepts().length).toBeGreaterThan(5)
  })

  it('a raiz declara a versão do OKF', () => {
    expect(read(join(DOCS, 'index.md'))).toMatch(/^---\nokf_version: "0\.2"\n---\n/)
  })

  it('todo conceito tem type registrado, title, description e generated', () => {
    const types = registeredTypes()
    expect(types.length).toBeGreaterThan(1)
    const broken = concepts().flatMap((path) => {
      const fm = frontmatter(path)
      if (!fm) return [`${path}: sem frontmatter`]
      const missing = ['type', 'title', 'description', 'generated'].filter((key) => !fm.get(key))
      const badType = fm.get('type') && !types.includes(fm.get('type')!) ? [`type ${fm.get('type')} fora do registro`] : []
      const verified = fm.has('verified') && !fm.get('verified')!.includes('human:') ? ['verified sem humano'] : []
      return [...missing.map((key) => `falta ${key}`), ...badType, ...verified].map((why) => `${path}: ${why}`)
    })
    expect(broken).toEqual([])
  })

  it('todo link é absoluto a partir da raiz do bundle e resolve para um arquivo', () => {
    const broken = bundle().flatMap((path) =>
      links(path)
        .filter((target) => !target.startsWith('/') || !existsSync(join(DOCS, target)))
        .map((target) => `${path} → ${target}`),
    )
    expect(broken).toEqual([])
  })

  it('o index.md de cada pasta lista todos os conceitos e subpastas dela', () => {
    const folders = [...new Set(bundle().map((path) => dirname(path)))]
    const missing = folders.flatMap((folder) => {
      const index = join(DOCS, folder, 'index.md')
      if (!existsSync(index)) return [`${folder}: sem index.md`]
      const listed = links(join(folder, 'index.md'))
      const children = [
        ...bundle().filter((path) => dirname(path) === folder && isConcept(path)),
        ...folders.filter((sub) => sub !== folder && dirname(sub) === folder).map((sub) => `${sub}/index.md`),
      ]
      return children.filter((child) => !listed.includes(child)).map((child) => `${folder}/index.md não lista ${child}`)
    })
    expect(missing).toEqual([])
  })
})

/** Os arquivos de texto do repo fora de `docs/`, pelo caminho relativo. */
function outsideDocs(dir = ROOT): string[] {
  const skip = ['node_modules', 'dist', 'WIP', '.git', 'docs.test.ts']
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    const isRootDocs = dir === ROOT && entry.name === 'docs'
    if (skip.includes(entry.name) || isRootDocs) return []
    if (entry.isDirectory()) return outsideDocs(path)
    return /\.(md|ts|vue|json|example)$|^Makefile$|^\.gitignore$/.test(entry.name) ? [relative(ROOT, path)] : []
  })
}

describe('as ADRs viraram o bundle', () => {
  const GONE = ['docs/adrs', 'docs/README.md', 'docs/architecture.md', 'docs/mvp.md', 'docs/roadmap.md', 'docs/auditoria-lacunas.md', 'docs/adaptacao-dailly.md', 'adrs/00']

  it('nada fora de docs/ aponta para um doc que saiu', () => {
    const files = outsideDocs()
    expect(files.length).toBeGreaterThan(50)
    const dangling = files.flatMap((path) => {
      const text = read(join(ROOT, path))
      return GONE.filter((gone) => text.includes(gone)).map((gone) => `${path} → ${gone}`)
    })
    expect(dangling).toEqual([])
  })

  it('o docs/adrs/ não existe mais', () => {
    expect(existsSync(join(DOCS, 'adrs'))).toBe(false)
  })

  it.each(Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(4, '0')))(
    'a ADR %s é achável pelo número na arquitetura',
    (number) => {
      expect(read(join(DOCS, 'conventions/architecture.md'))).toContain(`ADR ${number}`)
    },
  )
})
