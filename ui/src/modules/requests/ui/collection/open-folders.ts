import { ref } from 'vue'

const KEY = 'dailly.requests.open-folders'

/**
 * Quais pastas estão abertas, lembrado entre recargas.
 *
 * É preferência de quem olha, não dado do diário: por isso mora no navegador e
 * não no SQLite. E o navegador pode negar — janela privada, site sem storage,
 * cota cheia —, então toda leitura e escrita está num `try`, e sem storage a
 * árvore só esquece ao recarregar, que é o comportamento de antes.
 */
export function useOpenFolders(storage: () => Storage | undefined = () => globalThis.localStorage) {
  const open = ref<ReadonlySet<string>>(read())

  function read(): Set<string> {
    try {
      const raw = storage()?.getItem(KEY)
      const ids: unknown = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
    } catch {
      return new Set()
    }
  }

  function write(next: Set<string>): void {
    open.value = next
    try {
      storage()?.setItem(KEY, JSON.stringify([...next]))
    } catch {
      // sem storage, a árvore lembra só até recarregar
    }
  }

  return {
    isOpen: (id: string) => open.value.has(id),
    toggle(id: string): void {
      const next = new Set(open.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      write(next)
    },
    /** Abre sem fechar nada — para revelar o caminho até um item. */
    reveal(ids: readonly string[]): void {
      if (ids.every((id) => open.value.has(id))) return
      write(new Set([...open.value, ...ids]))
    },
  }
}
