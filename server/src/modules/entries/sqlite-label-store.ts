import { labelKey, type Label, type LabelColor } from '@dailly/domain'
import type { Database } from 'better-sqlite3'

/** Refusals of the label store, named so the routes can map them to a status. */
export class LabelNameTakenError extends Error {
  override readonly name = 'LabelNameTakenError'
  constructor() {
    super('já existe uma label com esse nome')
  }
}

export class LabelNotFoundError extends Error {
  override readonly name = 'LabelNotFoundError'
  constructor() {
    super('label não encontrada')
  }
}

export interface LabelStore {
  list(): Label[]
  create(input: { name: string; color: LabelColor }): Label
  update(id: string, change: { name?: string; color?: LabelColor }): Label
  delete(id: string): void
}

/**
 * The global labels (PRD Fase 2, RN1, card #34). Uniqueness is the `name_key`
 * column, the case-folded name the domain computes; deleting a label cascades
 * off every entry and task that carried it (RN2).
 */
export function sqliteLabelStore({ db, newId }: { db: Database; newId: () => string }): LabelStore {
  const byId = (id: string) =>
    db.prepare('SELECT id, name, color FROM labels WHERE id = ?').get(id) as Label | undefined

  const taken = (name: string, except?: string) =>
    db.prepare('SELECT 1 FROM labels WHERE name_key = ? AND id IS NOT ?').get(labelKey(name), except ?? null) !== undefined

  return {
    list: () => db.prepare('SELECT id, name, color FROM labels ORDER BY name_key').all() as Label[],

    create({ name, color }) {
      if (taken(name)) throw new LabelNameTakenError()
      const label: Label = { id: newId(), name, color }
      db.prepare('INSERT INTO labels (id, name, name_key, color) VALUES (?, ?, ?, ?)').run(
        label.id,
        name,
        labelKey(name),
        color,
      )
      return label
    },

    update(id, change) {
      const current = byId(id)
      if (!current) throw new LabelNotFoundError()
      if (change.name !== undefined && taken(change.name, id)) throw new LabelNameTakenError()
      const next: Label = { ...current, ...change }
      db.prepare('UPDATE labels SET name = ?, name_key = ?, color = ? WHERE id = ?').run(
        next.name,
        labelKey(next.name),
        next.color,
        id,
      )
      return next
    },

    delete(id) {
      if (db.prepare('DELETE FROM labels WHERE id = ?').run(id).changes === 0) throw new LabelNotFoundError()
    },
  }
}
