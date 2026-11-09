/**
 * Tasks: the public surface of the module.
 *
 * The module is the component. The model it shows lives in
 * `@dailly/tasks-core` and the store in the server; F1 is the list and the
 * capture (card #20), F2 brings the board (#21), F3 the panel (#22).
 */
export { default as component } from './ui/Tasks.vue'
import QuickCreate from './ui/create/QuickCreate.vue'
import TaskSearch from './ui/search/TaskSearch.vue'

/** The commands the manifest declares for Tasks: Ctrl+K, the search (card #47), and C, the quick create (#48). */
export const commands = { search: TaskSearch, create: QuickCreate }
export type { TasksDeps } from './deps.js'
