import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((file) => {
    const path = join(dir, file.name)
    if (file.isDirectory()) return sourceFiles(path)
    return file.name.endsWith('.ts') ? [path] : []
  })
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replaceAll('\\', '/'),
  code: readFileSync(path, 'utf8'),
}))

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

/** Production source — the tests and the test-only surface are judged separately. */
const PRODUCTION = FILES.filter(
  (file) => !file.path.endsWith('.test.ts') && !file.path.startsWith('testing/'),
)

describe('the domain runs anywhere', () => {
  it('finds source to inspect (guards against a silently empty scan)', () => {
    expect(PRODUCTION.length).toBeGreaterThan(5)
  })

  it('imports no node builtin', () => {
    // These use-cases run in the **renderer** (see `index.ts`). A `node:` import
    // here is not a layering smell to argue about later — it is code that would
    // not run at all. The tests are exempt: they run under node, and one of
    // them is this file.
    const found = PRODUCTION.flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => specifier.startsWith('node:'))
        .map((specifier) => `${file.path} → ${specifier}`),
    )
    expect(found).toEqual([])
  })

  it('touches no DOM global', () => {
    // The mirror of the rule above: the domain runs in the renderer but is not
    // *of* it. The tsconfig drops the DOM lib, so this catches what types
    // cannot see — a name reached dynamically or built as a string.
    const banned = /\b(?:document|window|navigator|localStorage|HTMLElement)\b/
    const found = PRODUCTION.map((file) => {
      const code = stripComments(file.code).replaceAll(/['"][^'"]*['"]/g, "''")
      const match = banned.exec(code)
      return match ? `${file.path} → ${match[0]}` : undefined
    }).filter(Boolean)
    expect(found).toEqual([])
  })

  it('keeps vitest out of the production surface', () => {
    // `entryRepositoryContract` imports vitest, which is why it lives behind
    // `@dailly/domain/testing` and not behind `@dailly/domain`. If that leaks,
    // every consumer of the domain inherits a test framework.
    const found = PRODUCTION.flatMap((file) =>
      importsOf(file.code)
        .filter((specifier) => specifier.startsWith('vitest'))
        .map((specifier) => `${file.path} → ${specifier}`),
    )
    expect(found).toEqual([])
  })
})
