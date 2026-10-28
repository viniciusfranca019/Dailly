/**
 * The development entry point: a fixed port, so `ui/`'s vite proxy has
 * something stable to point at.
 *
 * Since ADR 0012 it is also the production entry point: `make start` runs it
 * with the real diary (`DAILLY_DB`) on its own port, and `vite preview` proxies
 * to it the same way the dev server does.
 */
import { createServer } from './index.js'

const port = Number(process.env['DAILLY_PORT'] ?? 4317)

const server = await createServer({
  databaseFile: process.env['DAILLY_DB'] ?? 'dailly.dev.sqlite',
  ...(process.env['DAILLY_TZ'] ? { zone: process.env['DAILLY_TZ'] } : {}),
  port,
})

console.log(`dailly api: ${server.url}  ·  fuso: ${server.config.zone}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0))
  })
}
