import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type RunningServer } from '@dailly/server'
import { BrowserWindow, app, ipcMain, shell } from 'electron'

/**
 * The Electron main process: the window, and the API inside it.
 *
 * ADR 0008 chose Electron partly because this is all it takes — the main
 * process *is* Node, so Fastify runs here as an import. There is no sidecar to
 * package, no second binary to ship, no handshake between two processes and no
 * orphan when one of them dies.
 */

/** Set by `make desktop-dev`; absent in a built app. */
const DEV_URL = process.env['DAILLY_DEV_URL']

const RENDERER_INDEX = fileURLToPath(new URL('../../ui/dist/index.html', import.meta.url))
const PRELOAD = fileURLToPath(new URL('../preload.cjs', import.meta.url))

let server: RunningServer | undefined

/**
 * A fresh secret per run, never persisted.
 *
 * ADR 0008 wrote this into Fase 1 rather than leaving it for later: the API
 * listens on `127.0.0.1`, which every other process on this machine can reach.
 * Without a token, any program running as this user reads the diary. The port
 * is ephemeral for the same reason — there is no well-known door to knock on.
 */
const token = randomBytes(32).toString('hex')

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    // Wait for the first paint instead of showing an empty frame.
    show: false,
    webPreferences: {
      // The ADR 0008 checklist, which it calls obligatory rather than optional.
      // They are Electron's defaults today, and they are written out anyway:
      // a default can change under you, and a security property that depends on
      // one nobody wrote down is a property nobody is defending.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: PRELOAD,
    },
  })

  window.once('ready-to-show', () => window.show())

  // The renderer loads local content only — the other half of the checklist.
  // Anything that tries to navigate or open elsewhere leaves for the real
  // browser, where the user's own sandbox applies instead of ours.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const isLocal = target.protocol === 'file:' || target.hostname === 'localhost'
    if (!isLocal) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (DEV_URL) void window.loadURL(DEV_URL)
  else void window.loadFile(RENDERER_INDEX)

  return window
}

void app.whenReady().then(async () => {
  // `userData` is Electron's per-app directory for the OS — `~/.config/dailly`
  // on Linux. The database is the user's, in a place the OS already agreed is
  // theirs, and ADR 0005's backup story is "copy this file".
  const databaseFile = join(app.getPath('userData'), 'dailly.sqlite')

  server = await createServer({
    databaseFile,
    token,
    // Port 0: the OS picks. Nothing on this machine can guess where to knock.
    port: 0,
    ...(process.env['DAILLY_TZ'] ? { zone: process.env['DAILLY_TZ'] } : {}),
  })

  // The renderer asks for this; it is never pushed, never in argv, never in a
  // URL. See `preload.cjs` for why.
  ipcMain.handle('dailly:api-config', () => ({ baseUrl: server?.url, token }))

  createWindow()

  // macOS keeps the process alive with no windows; clicking the dock icon is
  // what asks for one back. Harmless on Linux, where it never fires.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close the database and release the port with the app, so a restart never
// races the previous run's listener.
app.on('will-quit', (event) => {
  if (!server) return
  event.preventDefault()
  const closing = server
  server = undefined
  void closing.close().then(() => app.quit())
})
