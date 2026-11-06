import { ref } from 'vue'
import { clampPanelWidth, PANEL_WIDTH, readPanelWidth } from '../model/width.js'

const KEY = 'dailly.tasks.panelWidth'

/**
 * The task panel's width, remembered in the browser (card #44), in the shape
 * of `useTasksView`: the storage is injectable, and a storage that is missing
 * or throws only means the width lasts until the reload (C5).
 *
 * A drag `follow`s the pointer without touching the storage; `settle` stores
 * the width once, when the edge is released, instead of on every move.
 */
export function usePanelWidth(storage: () => Storage | undefined = () => globalThis.localStorage) {
  const read = (): number => {
    try {
      return readPanelWidth(storage()?.getItem(KEY) ?? null)
    } catch {
      return PANEL_WIDTH.initial
    }
  }

  const width = ref(read())

  function follow(requested: number): void {
    width.value = clampPanelWidth(requested)
  }

  function settle(): void {
    try {
      storage()?.setItem(KEY, String(width.value))
    } catch {
      // sem storage, a largura vale até recarregar
    }
  }

  return { width, follow, settle }
}
