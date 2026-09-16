/**
 * The development entry point: a fixed port, so `ui/`'s vite proxy has
 * something stable to point at.
 *
 * Production does the opposite — an ephemeral port chosen at boot, handed to
 * the renderer by the Electron main process (ADR 0008). The two differ because
 * the constraints differ: in dev a human needs to know the URL, in production
 * nobody should.
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
