// @vitest-environment node
import { request, createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createServer as createVite, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * O proxy de `/api` tem que entregar à API o `Host` que o navegador mandou.
 *
 * A API recusa `Host` que não é desta máquina (ADR 0012) — é a defesa contra
 * DNS rebinding. Com `changeOrigin: true` o vite trocava todo `Host` por
 * `127.0.0.1:<porta>`, e a API nunca via o nome do atacante: a defesa não
 * fazia nada no único caminho que o app usa. Quem barrava era a checagem de
 * hosts do próprio vite, que uma configuração ou uma versão nova afrouxa.
 *
 * Aqui a checagem do vite é aberta de propósito (`allowedHosts: true`), e o
 * upstream é um servidor que só anota o `Host` — a recusa em si é testada na
 * API, em `server/src/app.test.ts`. As duas metades juntas são a cadeia.
 */
const CONFIG = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
const ROOT = fileURLToPath(new URL('.', import.meta.url))

let upstream: Server | undefined
let vite: ViteDevServer | undefined

afterEach(async () => {
  await vite?.close()
  await new Promise((resolve) => upstream?.close(resolve) ?? resolve(undefined))
  delete process.env['DAILLY_PORT']
})

const listening = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  )

const get = (port: number, path: string, host: string) =>
  new Promise<number>((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, headers: { host } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
      .on('error', reject)
      .end()
  })

describe('o proxy de /api', () => {
  it('repassa o Host do navegador, para a API poder recusá-lo', async () => {
    const hosts: (string | undefined)[] = []
    upstream = createHttpServer((req, res) => {
      hosts.push(req.headers.host)
      res.end('{}')
    })
    process.env['DAILLY_PORT'] = String(await listening(upstream))

    vite = await createVite({
      configFile: CONFIG,
      root: ROOT,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1', allowedHosts: true },
    })
    await vite.listen()
    const port = (vite.httpServer?.address() as AddressInfo).port

    expect(await get(port, '/api/health', 'atacante.example:5173')).toBe(200)
    expect(hosts).toEqual(['atacante.example:5173'])
  })
})
