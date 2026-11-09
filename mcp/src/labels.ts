import { findByName, nextColor, normalizeLabelName, type Label } from '@dailly/domain'
import type { Api } from './api.js'

/**
 * The global labels (RN13), named the way a person names them (card #58): by
 * name, without case, with the same `findByName` the screens use. A name that
 * does not exist is refused, naming it; creating one is `create_label`, never
 * a side effect of tagging.
 */
export function labelBook(api: Api) {
  const list = async () => (await api('/labels')) as Label[]

  return {
    list,

    async idsOf(names: readonly string[], known?: readonly Label[]): Promise<string[]> {
      const all = known ?? (await list())
      return names.map((name) => {
        const found = findByName(all, name)
        if (!found) throw new Error(`não existe a label "${name}"; crie com create_label, ou use uma destas: ${all.map((label) => label.name).join(', ') || 'nenhuma'}`)
        return found.id
      })
    },

    namesOf(ids: readonly string[], all: readonly Label[]): string[] {
      return ids.map((id) => all.find((label) => label.id === id)?.name ?? id)
    },

    async create(name: string, color?: string): Promise<Label> {
      const normalized = normalizeLabelName(name)
      if (normalized === null) throw new Error('o nome da label é obrigatório')
      return (await api('/labels', { method: 'POST', body: { name: normalized, color: color ?? nextColor(await list()) } })) as Label
    },
  }
}

export type LabelBook = ReturnType<typeof labelBook>
