import type { ModuleDeps, ModuleHandle } from '@shared'
import { createApp } from 'vue'
import DailyLog from './DailyLog.vue'

/**
 * The module's adapter to the shell: create a Vue app on the host, tear it down
 * on destroy.
 *
 * This is the whole surface where Vue meets the rest of the architecture —
 * eleven lines. The shell does not know Vue exists, and neither does the
 * domain.
 */
export function mountDailyLog(host: HTMLElement, deps: ModuleDeps): ModuleHandle {
  const app = createApp(DailyLog, { deps })
  app.mount(host)

  return {
    destroy() {
      app.unmount()
    },
  }
}
