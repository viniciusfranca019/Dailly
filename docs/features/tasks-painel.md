---
type: Feature
title: Tasks, painel da tarefa
description: O painel de uma tarefa, aberto pelo card ou pela linha, para editar título, status, prioridade e o corpo no editor de blocos, salvar com Ctrl+S e apagar com confirmação.
tags: [tasks, painel, edição]
status: stable
since: 0.1.5
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T17:00:00-03:00 }
---

# O que faz

- Clicar num card do board ou numa linha da lista abre o painel da tarefa, à direita:
  o título, o status, a prioridade (sem, urgente, alta, média, baixa) e o corpo no
  [editor de blocos](/features/whiteboard.md).
- Ctrl+S, ou o botão "Salvar", grava tudo de uma vez, e o card e a linha mostram a
  mudança. Mudar o status pelo painel põe a tarefa no topo do status novo. É o caminho
  sem mouse para mover uma tarefa.
- Título apagado é recusado com "o título é obrigatório", sem ir ao servidor.
- "Apagar" pede confirmação. Confirmar tira a tarefa do board e da lista; "Cancelar"
  não muda nada.
- Se a tarefa foi apagada enquanto o painel estava aberto, salvar mostra "tarefa não
  encontrada" com o caminho de volta ao board.
- Uma gravação recusada mostra a mensagem, e o card e a linha ficam como o servidor
  tem.
- Esc ou "Fechar" fecha o painel. O que não foi salvo se perde: o salvar é explícito.

# Regras

- **Um `PATCH /tasks/:key` só**, com qualquer subconjunto de `title`, `priority`,
  `body` e `statusId` com `rank`. O arrastar do [board](/features/tasks-board.md) manda
  só a posição. O store confere todos os campos antes da primeira escrita, então uma
  recusa não muda nada. `statusId` sem `rank` é recusado, porque a ordem é calculada
  pela tela (`placeAt`).
- **O corpo é o da Entry** (RN1): o `PATCH` grava o markdown do editor em
  `entries.body` e move o `updated_at`, pela função `updateEntryRow` que o Entries
  exporta.
- **RN7**: depois de salvar ou apagar, a tela relê o board.
- **RN8**: a prioridade é um inteiro de 0 a 4; fora disso, 400.

# Onde mora

- `packages/tasks-core/src/task-store.ts` (`TaskPatch`, `TaskStore.update`)
- `server/src/modules/tasks/routes.ts` (o `PATCH` parcial),
  `server/src/modules/entries/rows.ts` (`updateEntryRow`)
- `ui/src/modules/tasks/ui/detail/TaskPanel.vue`, `ui/src/modules/tasks/model/draft.ts`

# Entregue

No card #22 (F3 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-05.

# Limites

- Não abre pela URL (`/tasks/T-<n>`): o shell não tem rota por URL para módulo nenhum.
- Não avisa ao fechar com mudança não salva, nem salva sozinho.
