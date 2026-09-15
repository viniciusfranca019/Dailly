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

  it('a capability never imports a product module or the composition root', () => {
    // The rule the whole layout exists to protect, and it holds for the layer,
    // not just for the whiteboard: the moment a capability knows about Entry it
    // stops being a capability, and the markdown seam in adaptacao-dailly.md
    // stops being a seam.
    expect(
      violations(
        'capabilities/',
        (specifier) => specifier.startsWith('@modules') || specifier.startsWith('@app'),
      ),
    ).toEqual([])
  })

  it('shared depends on nobody', () => {
    // `shared/` is what every layer may import; if it imports back, the layering
    // is a circle with extra steps.
    expect(
      violations(
        'shared/',
        (specifier) =>
          specifier.startsWith('@modules') ||
          specifier.startsWith('@app') ||
          specifier.startsWith('@capabilities'),
      ),
    ).toEqual([])
  })

  it('a module never imports the composition root', () => {
    expect(violations('modules/', (specifier) => specifier.startsWith('@app'))).toEqual([])
  })

  it('a module reaches another module only through its public index', () => {
    // `@modules/analyse` is the surface; `@modules/analyse/ui/thing.js` is not.
    const deep = (specifier: string) =>
      specifier.startsWith('@modules/') && specifier.split('/').length > 2
    expect(violations('modules/', deep)).toEqual([])
    expect(violations('app/', deep)).toEqual([])
  })

  it('nothing reaches into a capability past its public entry points', () => {
    // `@capabilities/whiteboard` and `@capabilities/whiteboard/dom` are the
    // surface; `@capabilities/whiteboard/core/document.js` is not. Anything
    // deeper than <layer>/<capability>/<entry> is a bypass.
    const deep = (specifier: string) =>
      specifier.startsWith('@capabilities/') && specifier.split('/').length > 3
    expect(violations('', deep)).toEqual([])
  })

  it('nothing outside a capability climbs into it by relative path', () => {
    // The alias check above cannot see `../../capabilities/whiteboard/core/x`,
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

describe('the whiteboard core is DOM-free', () => {
  it('touches no DOM global or DOM type', () => {
    // The README claims this; without a test it is only a claim, and it is the
    // property that lets the core survive a move to React untouched.
    const banned = /\b(?:document|window|navigator|HTMLElement|HTMLDivElement|Range|Selection)\b/
    const found = under('capabilities/whiteboard/core/')
      .map((file) => {
        // Import specifiers legitimately contain the word "document".
        const code = stripComments(file.code).replaceAll(/['"][^'"]*['"]/g, "''")
        const match = banned.exec(code)
        return match ? `${file.path} → ${match[0]}` : undefined
      })
      .filter(Boolean)
    expect(found).toEqual([])
  })

  it('the public core entry point pulls in no DOM adapter', () => {
    const entry = FILES.find((file) => file.path === 'capabilities/whiteboard/index.ts')!
    expect(importsOf(entry.code).some((specifier) => specifier.includes('adapters'))).toBe(false)
  })
})
