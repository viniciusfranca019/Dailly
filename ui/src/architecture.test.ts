import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.vue') ? [path] : []
  })
}

/**
 * The script half of a single-file component, or the file itself.
 *
 * A `.vue` file does not parse as TypeScript, and only its `<script>` blocks
 * can import anything — a `<template>` has no import statement and a `<style>`
 * only reaches CSS. Narrowing to the script is what keeps a quoted path sitting
 * in markup from being read as a dependency.
 */
function scriptOf(code: string): string {
  const blocks = [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  return blocks.length === 0 ? '' : blocks.map((match) => match[1]!).join('\n')
}

/**
 * This file, which the scan must not judge.
 *
 * It is the only source in the tree that contains deliberately-wrong import
 * specifiers: the fixtures the rules are proven against. They are data, not
 * dependencies — nothing here imports them — and leaving them in the scan makes
 * the suite fail on its own examples. Excluding one known path is narrower than
 * excluding every test, which would stop the rules covering the tests at all.
 */
const SELF = 'architecture.test.ts'

const FILES = sourceFiles(SRC)
  .map((path) => {
    const source = readFileSync(path, 'utf8')
    return {
      path: relative(SRC, path).replaceAll('\\', '/'),
      code: path.endsWith('.vue') ? scriptOf(source) : source,
    }
  })
  .filter((file) => file.path !== SELF)

const stripComments = (code: string) =>
  code.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')

/** Every module specifier a file pulls in — static, dynamic and side-effect. */
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
 * The three shapes of "reached past the public entry point", named once.
 *
 * They are predicates at module scope rather than inline in their tests so the
 * suite can prove them against a *known-bad* source below. A rule that is only
 * ever run against a clean tree passes for two reasons and tells them apart
 * for neither: because the code is clean, or because the scan missed it.
 */
const deepModuleImport = (specifier: string) =>
  specifier.startsWith('@modules/') && specifier.split('/').length > 2

const deepCapabilityImport = (specifier: string) =>
  specifier.startsWith('@capabilities/') && specifier.split('/').length > 3

/**
 * The climb an alias check cannot see: `../../capabilities/whiteboard/x`.
 *
 * An aliased import is the supported way in and is judged by the rule above,
 * not by this one — so this predicate looks only at relative specifiers.
 */
const relativeCapabilityImport = (specifier: string) =>
  !specifier.startsWith('@') && /capabilities\/[^/]+\//.test(specifier)

/**
 * A subida até `src/adapters/` — que é composição, não material de módulo.
 *
 * Um módulo que alcança o adapter constrói o próprio cliente HTTP, e com isso
 * deixa de poder ser montado sobre um fake: o teste passa a precisar de
 * servidor para exercitar uma tela. A port chega pelas `deps`, da raiz de
 * composição, e é o que mantém as duas coisas separáveis.
 *
 * O caminho é relativo porque não existe alias para `adapters/` — de propósito,
 * pelo mesmo motivo que não existe `@shell`. A âncora `^\.\.` é o que impede
 * esta regra de acusar o `./adapters/dom/` que vive **dentro** da capability e
 * é dela.
 */
const adapterImport = (specifier: string) => /^\.\.\/(\.\.\/)*adapters\//.test(specifier)

const under = (prefix: string) => FILES.filter((file) => file.path.startsWith(prefix))

const violations = (prefix: string, forbidden: (specifier: string) => boolean) =>
  under(prefix).flatMap((file) =>
    importsOf(file.code)
      .filter(forbidden)
      .map((specifier) => `${file.path} → ${specifier}`),
  )

describe('the arrow only points downwards', () => {
  it('finds source to inspect (guards against a silently empty scan)', () => {
    expect(FILES.length).toBeGreaterThan(15)
    expect(under('capabilities/').length).toBeGreaterThan(5)
    expect(under('modules/').length).toBeGreaterThan(1)
  })

  it('C6: reads single-file components, not only TypeScript', () => {
    // Every rule below is only as wide as this list. The shell and the whole
    // Daily Log are `.vue` now, so a scan that stops at `.ts` would report a
    // clean tree while checking almost none of the UI.
    expect(FILES.filter((file) => file.path.endsWith('.vue')).length).toBeGreaterThan(3)
    expect(FILES.map((file) => file.path)).toContain('shell/Shell.vue')

    // Listing the path is not reading it. An extractor that returned '' for
    // every SFC would keep the count above intact and quietly make every rule
    // below vacuous for all six components — the same class of failure the
    // count itself is guarding against, one level down.
    expect(FILES.find((file) => file.path === 'shell/Shell.vue')?.code).toContain(
      "from '@shared'",
    )
  })

  it('C6: catches a boundary violation written inside a single-file component', () => {
    // The proof that the rules *fire* on an SFC, run against source that is
    // deliberately wrong. Without it, a green suite could mean the extractor
    // silently returned nothing.
    // C6 names two shapes — "a deep path, **or a capability by a relative
    // path**" — so the fixture carries both. The relative climb is the one an
    // alias check cannot see, which makes it the half most worth proving.
    const sfc = [
      '<script setup lang="ts">',
      "import { setCaret } from '@capabilities/whiteboard/adapters/dom/caret.js'",
      "import { formatDay } from '@modules/daily-log/ui/timeline.js'",
      "import { el } from '../../capabilities/whiteboard/adapters/dom/dom.js'",
      '</script>',
      '<template><p>@capabilities/not/an/import</p></template>',
    ].join('\n')

    const specifiers = importsOf(scriptOf(sfc))

    expect(specifiers.filter(deepCapabilityImport)).toEqual([
      '@capabilities/whiteboard/adapters/dom/caret.js',
    ])
    expect(specifiers.filter(deepModuleImport)).toEqual(['@modules/daily-log/ui/timeline.js'])
    expect(specifiers.filter(relativeCapabilityImport)).toEqual([
      '../../capabilities/whiteboard/adapters/dom/dom.js',
    ])
    // The template's text is not a dependency, and must not be read as one.
    expect(specifiers).toHaveLength(3)
  })

  it('C13: nenhum módulo nem capability alcança os adapters da raiz', () => {
    expect(violations('modules/', adapterImport)).toEqual([])
    expect(violations('capabilities/', adapterImport)).toEqual([])
    expect(violations('shared/', adapterImport)).toEqual([])
  })

  it('C13: a regra dos adapters dispara, e poupa o adapter interno da capability', () => {
    // Provada contra fonte deliberadamente errada, como as outras: uma regra
    // que só roda numa árvore limpa passa por dois motivos e não distingue
    // nenhum — porque o código está certo, ou porque a varredura não viu.
    const specifiers = [
      '../../adapters/http-requests-client.js',
      '../../../adapters/api.js',
      './adapters/dom/index.js',
      '@shared',
    ]

    expect(specifiers.filter(adapterImport)).toEqual([
      '../../adapters/http-requests-client.js',
      '../../../adapters/api.js',
    ])
  })

  it('a capability never imports a product module', () => {
    // The rule the whole layout exists to protect, and it holds for the layer,
    // not just for the whiteboard: the moment a capability knows about Entry it
    // stops being a capability. (The shell is covered by its own rule below;
    // the model this adapter renders is a package now, and `architecture.test.ts`
    // at the workspace root guards *its* arrows.)
    expect(
      violations('capabilities/', (specifier) => specifier.startsWith('@modules')),
    ).toEqual([])
  })

  it('shared depends on nobody', () => {
    // `shared/` is what every layer may import; if it imports back, the layering
    // is a circle with extra steps.
    expect(
      violations(
        'shared/',
        (specifier) =>
          specifier.startsWith('@modules') || specifier.startsWith('@capabilities'),
      ),
    ).toEqual([])
  })

  it('nothing outside the shell imports the composition root', () => {
    // `shell/` wires the app together; everything it touches must be able to
    // exist without it. There is no `@shell` alias on purpose — nobody outside
    // should be importing it at all, so the rule looks for any path into it,
    // which also catches the relative climb an alias check would miss.
    const found = FILES.filter((file) => !file.path.startsWith('shell/')).flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => /(^|\/)shell\//.test(specifier))
        .map((specifier) => `${file.path} → ${specifier}`),
    )
    expect(found).toEqual([])
  })

  it('a module reaches another module only through its public index', () => {
    // `@modules/analyse` is the surface; `@modules/analyse/ui/thing.js` is not.
    expect(violations('', deepModuleImport)).toEqual([])
  })

  it('nothing reaches into a capability past its public entry points', () => {
    // `@capabilities/whiteboard/dom` is the surface;
    // `@capabilities/whiteboard/adapters/dom/caret.js` is not. Anything deeper
    // than <layer>/<capability>/<entry> is a bypass.
    expect(violations('', deepCapabilityImport)).toEqual([])
  })

  it('nothing outside a capability climbs into it by relative path', () => {
    // The alias check above cannot see `../../capabilities/whiteboard/adapters/x`,
    // so this one looks at relative specifiers only — an aliased import is the
    // supported way in and is judged by the rule above, not by this one.
    const found = FILES.filter((file) => !file.path.startsWith('capabilities/')).flatMap((file) =>
      importsOf(file.code)
        .filter(relativeCapabilityImport)
        .map((specifier) => `${file.path} → ${specifier}`),
    )
    expect(found).toEqual([])
  })
})
