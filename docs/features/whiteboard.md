---
type: Feature
title: Editor de blocos
description: O whiteboard estilo Notion em que se escreve o corpo de uma entrada; markdown entra, markdown sai, e ele não conhece o produto.
tags: [whiteboard, editor, capacidade]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- Escreve-se em blocos. O começo da linha decide o tipo: `#` a `####` é título,
  `-`, `*` ou `+` é lista, `1.` ou `1)` é lista numerada, `[]`, `[ ]` ou `[x]` é tarefa
  (as formas GFM `- [ ]` também), e o resto é parágrafo.
- A caixa da tarefa marca e desmarca no clique. Bloco com filhos ganha seta ▸/▾ para
  recolher.
- Teclado: Enter divide o bloco e Backspace no começo junta com o anterior; Tab e
  Shift+Tab (ou Ctrl+D) indentam e desindentam; Alt+↑/↓ move blocos; Shift+↑/↓ estende a
  seleção; Ctrl+A seleciona o bloco e, na segunda vez, o quadro; Backspace ou Delete
  apaga a seleção; Esc a limpa.
- Dentro do bloco, o markdown inline aparece formatado e sem os marcadores: `` `código` ``
  em fonte monoespaçada com fundo, `**negrito**`, `*itálico*` e `[texto](https://…)`
  como link, que abre numa aba nova (LAB-5). Vale no Daily Log, no corpo das tarefas e
  nos comentários. O bloco com o cursor mostra o texto cru, com os marcadores, para
  editar; o cursor de um clique cai no mesmo caractere. Num bloco editável o clique
  edita e Ctrl/Cmd+clique abre o link; num só de leitura o clique abre.
- Marcador sem par ou com espaço na borda (`2 ** 3`) fica como foi escrito, e só
  `http:`, `https:` e `mailto:` viram link: `javascript:` e o resto ficam como texto.
- No Daily Log, a barra H1, H2, •, 1. e ☐ aplica o tipo ao bloco do cursor. Ela é do
  `Composer.vue`, não do editor.
- `/playground/` (no `make dev`) abre o editor sozinho, para conferir comportamento real
  de navegador.

# Regras

- É uma **capacidade**, não um módulo: recebe e devolve markdown
  (`setMarkdown` / `toMarkdown`) e não sabe o que é uma `Entry`.
- O markdown inline só é lido, nunca gravado: o modelo guarda o texto cru, e o
  `toMarkdown` devolve os marcadores como vieram (`parseInline` no core, puro;
  `renderInlineMarkdown` no adapter).
- A serialização é canônica: `* a` vira `- a`, a numeração é refeita pela posição, a
  tarefa volta como `[] ` ou `[x] `, tab vira espaço.
- Um documento nunca fica sem bloco, para sempre haver onde pôr o cursor.
- O Vue nunca renderiza dentro dele: é uma ilha vanilla montada num `ref`, porque um
  vdom reconciliando nós em edição briga com o caret
  ([Arquitetura](/conventions/architecture.md), ADR 0010).

# Onde mora

- `packages/whiteboard-core/src/`: o modelo, o parser, o serializer e as edições, sem DOM.
- `ui/src/capabilities/whiteboard/`: o adapter DOM; `ui/src/playground/`.

# Entregue

Veio do rangrig em 2026-09-15; o core virou pacote, e a seleção e as edições em
conjunto chegaram em 2026-09-16, em commits diretos. Sempre ligado.

# Limites

- Sem atalho nem botão de formatação inline: o markdown inline é escrito à mão. Sem
  riscado, sublinhado, imagem nem HTML; o itálico é só com `*`, não com `_`, para não
  pegar `snake_case`.
- O `vue-tsc` não roda com o TypeScript 7, então o `Composer.vue` não é typechecado.
