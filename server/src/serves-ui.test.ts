import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UTC } from '@dailly/periods'
import { describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * Card #61, the server's half of the image: one process serves the built
 * screen and the API on the same origin, the API under `/api` as the vite
 * proxy has always exposed it (C2), and the Host guard covers both (C4).
 */
function builtUi(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dailly-ui-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>dailly</title>')
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("dailly")')
  return dir
}

const app = () => buildApp({ zone: UTC, db: openDatabase(':memory:'), uiDir: builtUi() })
const local = { host: '127.0.0.1:4318' }

describe('C2: Um container serve a tela e a API', () => {
  it('a raiz é a tela, os assets saem da ui/dist, e a API responde em /api', async () => {
    const server = app()

    const page = await server.inject({ method: 'GET', url: '/', headers: local })
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect(page.body).toContain('<title>dailly</title>')

    const asset = await server.inject({ method: 'GET', url: '/assets/app.js', headers: local })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toContain('javascript')

    const health = await server.inject({ method: 'GET', url: '/api/health', headers: local })
    expect(health.json()).toMatchObject({ status: 'ok', zone: 'UTC' })
    const boards = await server.inject({ method: 'GET', url: '/api/boards', headers: local })
    expect(boards.json()).toEqual([expect.objectContaining({ name: 'Tasks' })])
  })

  it('não serve nada fora da ui/dist', async () => {
    const response = await app().inject({ method: 'GET', url: '/../../etc/passwd', headers: local })
    expect(response.statusCode).toBe(404)
  })

  it('sem uiDir, a API continua na raiz e não há tela, como no make dev', async () => {
    const server = buildApp({ zone: UTC, db: openDatabase(':memory:') })
    expect((await server.inject({ method: 'GET', url: '/health', headers: local })).statusCode).toBe(200)
    expect((await server.inject({ method: 'GET', url: '/', headers: local })).statusCode).toBe(404)
  })
})

describe('C4: A guarda de Host continua', () => {
  it('recusa Host de fora na tela e na API', async () => {
    const server = app()
    for (const url of ['/', '/assets/app.js', '/api/health']) {
      const response = await server.inject({ method: 'GET', url, headers: { host: 'evil.example' } })
      expect(response.statusCode, url).toBe(403)
    }
  })
})
