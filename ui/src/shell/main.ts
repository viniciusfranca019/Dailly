import { createEntry, queryEntries, systemClock, uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { resolveApiConfig } from '../adapters/api.js'
import { httpEntryRepository } from '../adapters/http-entry-repository.js'
import { mountShell } from './mount.js'
import { MODULES } from './modules.js'
import './styles.css'

/**
 * The composition root of the renderer.
 *
 * This is the only file that knows every concrete choice at once: that the
 * store is reached over HTTP, that ids are UUIDs, that time comes from the
 * system. Everything below it receives those choices and could receive others —
 * which is what makes the modules testable without a server and the domain
 * testable without either.
 */
const host = document.querySelector<HTMLElement>('#app')!

async function boot(): Promise<void> {
  const config = resolveApiConfig()
  const entries = httpEntryRepository({ config })

  // The zone belongs to the API process (ADR 0007), so the renderer asks rather
  // than assumes. If the API is not up we fall back to UTC and carry on: a
  // timeline in the wrong zone is bad, a blank screen is worse, and the
  // indicator on screen will not be claiming something false for long — the
  // first request will fail visibly.
  let zone = UTC
  try {
    const health = (await fetch(`${config.baseUrl}/health`)).json() as Promise<{ zone?: string }>
    zone = (await health).zone ?? UTC
  } catch {
    zone = UTC
  }

  await mountShell(host, {
    modules: MODULES,
    deps: {
      createEntry: createEntry({ entries, clock: systemClock, ids: uuidIds }),
      queryEntries: queryEntries({ entries }),
      zone,
    },
  })
}

void boot()
