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

describe('the core is DOM-free', () => {
  it('finds source to inspect (guards against a silently empty scan)', () => {
    expect(FILES.length).toBeGreaterThan(10)
  })

  it('touches no DOM global or DOM type', () => {
    // `tsconfig.json` leaves the DOM lib out, so a typed `document` already
    // fails to compile. This test covers what types cannot see — the name
    // reached dynamically, or built as a string — and states the property in
    // one place instead of leaving it implicit in a compiler flag.
    const banned = /\b(?:document|window|navigator|HTMLElement|HTMLDivElement|Range|Selection)\b/
    // This file is excluded from its own rule: the banned names are spelled out
    // right above, and a rule that trips on its own text is a rule nobody can
    // write. Everything else in the package is fair game.
    const found = FILES.filter((file) => file.path !== 'architecture.test.ts').map((file) => {
      // Import specifiers legitimately contain the word "document".
      const code = stripComments(file.code).replaceAll(/['"][^'"]*['"]/g, "''")
      const match = banned.exec(code)
      return match ? `${file.path} → ${match[0]}` : undefined
    }).filter(Boolean)
    expect(found).toEqual([])
  })
})
