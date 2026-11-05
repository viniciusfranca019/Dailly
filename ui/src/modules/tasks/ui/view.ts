import { ref } from 'vue'

export type TasksView = 'board' | 'list'

const KEY = 'dailly.tasks.view'

/**
 * The view the person chose, remembered in the browser (C6), board on the
 * first visit. The same shape as the Requests' open folders: the storage is
 * injectable, and a storage that is missing or throws (private window,
 * blocked site data) only means the choice lasts until the reload.
 */
export function useTasksView(storage: () => Storage | undefined = () => globalThis.localStorage) {
  const read = (): TasksView => {
    try {
      return storage()?.getItem(KEY) === 'list' ? 'list' : 'board'
    } catch {
      return 'board'
    }
  }

  const view = ref<TasksView>(read())

  function choose(next: TasksView): void {
    view.value = next
    try {
      storage()?.setItem(KEY, next)
    } catch {
      // sem storage, a escolha vale até recarregar
    }
  }

  return { view, choose }
}
