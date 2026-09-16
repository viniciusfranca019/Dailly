import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveApiConfig } from './api.js'

const withBridge = (bridge: unknown) => {
  ;(globalThis as { dailly?: unknown }).dailly = bridge
}

afterEach(() => {
  delete (globalThis as { dailly?: unknown }).dailly
})

describe('resolveApiConfig', () => {
  it('falls back to the vite proxy when there is no shell', async () => {
    // This is dev: no Electron, no token, and `/api` is proxied to the API on
    // its fixed port.
    expect(await resolveApiConfig()).toEqual({ baseUrl: '/api' })
  })

  it('asks the shell, and takes the ephemeral port and token it answers with', async () => {
    // The production path. The renderer knows neither value until it asks:
    // the port is whatever the OS gave the server this run, and the token is
    // generated per run and never persisted.
    const apiConfig = vi.fn(async () => ({
      baseUrl: 'http://127.0.0.1:41999',
      token: 'token-desta-execucao',
    }))
    withBridge({ apiConfig })

    expect(await resolveApiConfig()).toEqual({
      baseUrl: 'http://127.0.0.1:41999',
      token: 'token-desta-execucao',
    })
    expect(apiConfig).toHaveBeenCalledOnce()
  })

  it('falls back when a bridge exists but exposes nothing useful', async () => {
    // Defensive, and cheap: a preload that loaded but failed to expose should
    // leave the app working in dev rather than crashing at boot.
    withBridge({})
    expect(await resolveApiConfig()).toEqual({ baseUrl: '/api' })
  })
})
