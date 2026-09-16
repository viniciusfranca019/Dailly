import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'

/**
 * The Electron main process — for now, a window and nothing else.
 *
 * Fase 1 builds this in two steps on purpose. Today it opens the renderer so
 * the editor can be seen in the engine it will actually ship on (ADR 0008 §2:
 * the `contenteditable` workaround was written against Chrome and had never run
 * outside jsdom). The Fastify API moves in here later, as an import, in the
 * unit that gives it something to serve.
 */

/** Set by `make desktop-dev`; absent in a built app. */
const DEV_URL = process.env['DAILLY_DEV_URL']

/**
 * Where the built renderer lives, relative to `desktop/dist/main.js`.
 *
 * This is the un-packaged layout. `electron-builder` relocates both sides into
 * the asar, so the packaging unit revisits it — with `app.isPackaged` as the
 * discriminator, not another env var.
 */
const RENDERER_INDEX = fileURLToPath(new URL('../../ui/dist/index.html', import.meta.url))

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

void app.whenReady().then(() => {
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
