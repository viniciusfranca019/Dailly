import type { PropertyDef, PropertyType } from '@dailly/domain'
import type { Database } from 'better-sqlite3'

export class PropertyKeyTakenError extends Error {
  override readonly name = 'PropertyKeyTakenError'
  constructor(key: string) {
    super(`${key} já tem tipo`)
  }
}

export interface PropertyDefStore {
  list(): PropertyDef[]
  /** A key is defined once; its type never changes (PRD Fase 2, Fora de escopo). */
  define(key: string, type: PropertyType): PropertyDef
}

export function sqlitePropertyDefs({ db }: { db: Database }): PropertyDefStore {
  return {
    list: () => db.prepare('SELECT key, type FROM property_defs ORDER BY key').all() as PropertyDef[],
    define(key, type) {
      if (db.prepare('SELECT 1 FROM property_defs WHERE key = ?').get(key)) throw new PropertyKeyTakenError(key)
      db.prepare('INSERT INTO property_defs (key, type) VALUES (?, ?)').run(key, type)
      return { key, type }
    },
  }
}
