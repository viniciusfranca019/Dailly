import { WhiteboardDocument } from '@capabilities/whiteboard'
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

// The markdown has no pane of its own any more, so keep the document reachable
// from the console: `dailly.toMarkdown()`.
Object.assign(globalThis, { dailly: store })
