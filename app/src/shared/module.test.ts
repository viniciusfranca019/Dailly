import { describe, expect, it } from 'vitest'
import { ManifestError, assertManifest, findByRoute, type ModuleDescriptor } from '@shared'

const descriptor = (id: string, route: string): ModuleDescriptor<unknown> => ({
  id,
  title: id,
  route,
  load: () => Promise.resolve({}),
})

describe('assertManifest', () => {
  it('accepts a manifest with unique ids and routes', () => {
    expect(() =>
      assertManifest([descriptor('daily-log', '/'), descriptor('analyse', '/analyse')]),
    ).not.toThrow()
  })

  it('rejects an empty manifest', () => {
    // A build where every flag is off is a mistake, not a valid product.
    expect(() => assertManifest([])).toThrow(ManifestError)
  })

  it('rejects a duplicated id', () => {
    expect(() => assertManifest([descriptor('a', '/one'), descriptor('a', '/two')])).toThrow(
      /duplicate module id: a/,
    )
  })

  it('rejects a duplicated route, which would silently shadow a module', () => {
    expect(() => assertManifest([descriptor('a', '/same'), descriptor('b', '/same')])).toThrow(
      /duplicate module route: \/same/,
    )
  })
})

describe('findByRoute', () => {
  const modules = [descriptor('daily-log', '/'), descriptor('analyse', '/analyse')]

  it('finds the module owning a route', () => {
    expect(findByRoute(modules, '/analyse')?.id).toBe('analyse')
  })

  it('returns undefined for a route no module claims', () => {
    // This is what a flagged-off module looks like from the shell's side.
    expect(findByRoute(modules, '/settings')).toBeUndefined()
  })
})
