import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard } from '@capabilities/whiteboard/dom'

const SAMPLE = [
  '# Daily 14/09',
  '',
  '## Manhã',
  '  [] daily meeting',
  '    - falar do deploy',
  '  [x] café',
  '',
  '## Tarefas',
  '  1. revisar PR',
  '  2. escrever testes',
  '    - parser',
  '    - serializer',
  '  3. deploy',
  '',
  '### Notas',
  '  - todo bloco com filhos colapsa: clique na setinha do título',
  '  - clique no texto e edite direto no bloco',
  '',
  '#### Rodapé',
  'texto solto vira parágrafo.',
].join('\n')

const container = document.querySelector<HTMLElement>('#whiteboard')!

const store = new WhiteboardDocument(SAMPLE)
mountWhiteboard(container, store)

/**
 * The same board with nothing in it.
 *
 * It is here because of a bug that shipped: `.wb-text` carries `flex: 1`, but
 * the flex item is the wrapper around it, and an empty wrapper collapses to
 * zero width. With content, nobody could tell. Empty, the editor had no
 * clickable area at all and the app looked dead while being perfectly
 * functional. Layout is exactly what the test suite cannot see.
 */
const emptyStore = new WhiteboardDocument('')
mountWhiteboard(document.querySelector<HTMLElement>('#whiteboard-empty')!, emptyStore)

// The markdown has no pane of its own any more, so keep the document reachable
// from the console: `dailly.toMarkdown()`.
Object.assign(globalThis, { dailly: store, daillyVazio: emptyStore })
