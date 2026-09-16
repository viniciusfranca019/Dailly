/**
 * The preload script: the only thing the renderer can see of the main process.
 *
 * Hand-written CommonJS, and not TypeScript compiled to ESM, because a
 * sandboxed preload (ADR 0008's checklist) must be CJS — Electron does not load
 * an ESM preload into a sandboxed renderer. Ten lines is a fair price for not
 * building a second pipeline to produce them.
 *
 * It exposes a *function*, not the config itself, so the token is handed over
 * on request through IPC. The alternatives leak it: `additionalArguments` puts
 * it in `process.argv`, which any process of this user can read with `ps`, and
 * a query string on `loadURL` puts it in history and logs.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dailly', {
  apiConfig: () => ipcRenderer.invoke('dailly:api-config'),
})
