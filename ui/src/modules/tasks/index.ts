/**
 * Tasks: the public surface of the module.
 *
 * The module is the component. The model it shows lives in
 * `@dailly/tasks-core` and the store in the server; F1 is the list and the
 * capture (card #20), F2 brings the board (#21), F3 the panel (#22).
 */
export { default as component } from './ui/Tasks.vue'
export type { TasksDeps } from './deps.js'
