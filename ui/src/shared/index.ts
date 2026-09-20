/** What every layer may depend on. Imports nothing from `whiteboard/` or `modules/`. */
export { assertManifest, findByRoute, ManifestError } from './module.js'
export type { ModuleDescriptor } from './module.js'
export type { VueModule } from './vue-module.js'
export type { ModuleDeps } from './deps.js'
