import type { ModuleHandle } from '@shared'
import { WhiteboardDocument } from '@capabilities/whiteboard'
import { mountWhiteboard } from '@capabilities/whiteboard/dom'

const PLACEHOLDER = ['# Hoje', '', '[] primeira entrada'].join('\n')

/**
 * The Daily Log screen.
 *
 * It consumes the whiteboard through its public surface only, and the seam with
 * persistence is the one `docs/adaptacao-dailly.md` already fixed: the
 * whiteboard edits `Entry.body`, never the Entry. `EntryRepository` and the
 * use-cases land here in Phase 1 of the roadmap; this module owns that domain
 * when it does, which is why `Entry` will live under `modules/daily-log`, not
 * in a global `domain/`.
 */
export function mountDailyLog(host: HTMLElement): ModuleHandle {
  const section = document.createElement('section')
  section.className = 'daily-log'

  const board = document.createElement('div')
  board.className = 'whiteboard'
  section.append(board)
  host.append(section)

  const doc = new WhiteboardDocument(PLACEHOLDER)
  const handle = mountWhiteboard(board, doc)

  return {
    destroy() {
      handle.destroy()
      section.remove()
    },
  }
}
