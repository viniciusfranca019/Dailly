import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replaceAll('\\', '/'),
  code: readFileSync(path, 'utf8'),
}))

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
    const deep = (specifier: string) =>
      specifier.startsWith('@modules/') && specifier.split('/').length > 2
    expect(violations('', deep)).toEqual([])
  })

  it('nothing reaches into a capability past its public entry points', () => {
    // `@capabilities/whiteboard/dom` is the surface;
    // `@capabilities/whiteboard/adapters/dom/caret.js` is not. Anything deeper
    // than <layer>/<capability>/<entry> is a bypass.
    const deep = (specifier: string) =>
      specifier.startsWith('@capabilities/') && specifier.split('/').length > 3
    expect(violations('', deep)).toEqual([])
  })

  it('nothing outside a capability climbs into it by relative path', () => {
    // The alias check above cannot see `../../capabilities/whiteboard/adapters/x`,
    // so this one looks at relative specifiers only — an aliased import is the
    // supported way in and is judged by the rule above, not by this one.
    const found = FILES.filter((file) => !file.path.startsWith('capabilities/')).flatMap((file) =>
      importsOf(file.code)
        .filter(
          (specifier) => !specifier.startsWith('@') && /capabilities\/[^/]+\//.test(specifier),
        )
        .map((specifier) => `${file.path} → ${specifier}`),
    )
    expect(found).toEqual([])
  })
})
