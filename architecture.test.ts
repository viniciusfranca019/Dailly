import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The workspace-level rule, the one ADR 0007 asks for by name:
 *
 *   "`packages/` não importa de `server/` nem de `ui/`; `server/` e `ui/`
 *    importam `packages/`, nunca um ao outro."
 *
 * Each project has its own architecture test for its own internals. This one
 * owns the arrows *between* projects, because no single project can see them.
 */

const ROOT = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.vue') ? [path] : []
  })
}

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

/** Every source file of a top-level project, keyed by repo-relative path. */
const filesUnder = (project: string) =>
  sourceFiles(join(ROOT, project)).map((path) => ({
    path: relative(ROOT, path).replaceAll('\\', '/'),
    code: readFileSync(path, 'utf8'),
  }))

const violations = (project: string, forbidden: (specifier: string) => boolean) =>
  filesUnder(project).flatMap((file) =>
    importsOf(file.code)
      .filter(forbidden)
      .map((specifier) => `${file.path} → ${specifier}`),
  )

/** A specifier that lands inside `project`, by package name or by relative climb. */
const reaches = (project: string, ...packageNames: string[]) => {
  const climb = new RegExp(`(^|/)${project}/`)
  return (specifier: string) =>
    packageNames.includes(specifier) ||
    packageNames.some((name) => specifier.startsWith(`${name}/`)) ||
    (specifier.startsWith('.') && climb.test(specifier))
}

describe('the arrow between projects only points into packages/', () => {
  it('finds source to inspect (guards against a silently empty scan)', () => {
    expect(filesUnder('packages').length).toBeGreaterThan(10)
    expect(filesUnder('ui').length).toBeGreaterThan(10)
  })

  it('a package imports neither the renderer nor the server', () => {
    // The whole reason the core moved out of `ui/`: it is shared, so it cannot
    // know either consumer. The day it imports one, it stops being shareable
    // and the move bought nothing.
    expect(violations('packages', reaches('ui', '@dailly/ui'))).toEqual([])
    expect(violations('packages', reaches('server', '@dailly/server'))).toEqual([])
  })

  it('the renderer and the server never import each other', () => {
    // They talk over HTTP (ADR 0008), which is the fronteira that ADR 0009's
    // "server boots without Electron" test keeps honest. An import between them
    // would make that test pass while the separation is already gone.
    expect(violations('ui', reaches('server', '@dailly/server'))).toEqual([])
    expect(violations('server', reaches('ui', '@dailly/ui'))).toEqual([])
  })

  it('nothing imports the desktop shell', () => {
    // `desktop/` is the composition root of the Electron process — the top of
    // the graph. Anything importing it is a layer reaching for its own shell.
    for (const project of ['packages', 'ui', 'server']) {
      expect(violations(project, reaches('desktop', '@dailly/desktop'))).toEqual([])
    }
  })
})
