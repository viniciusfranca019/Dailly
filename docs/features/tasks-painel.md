---
type: Feature
title: Tasks, painel da tarefa
description: O painel de uma tarefa, aberto pelo card ou pela linha, para editar título, status, prioridade e o corpo no editor de blocos, salvar com Ctrl+S, apagar com confirmação e comentar.
tags: [tasks, painel, edição, comentários]
status: stable
since: 0.1.5
generated: { by: regulus/claude-opus-5-5, at: 2026-11-06T16:00:00-03:00 }
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
- Arrastar a borda esquerda muda a largura do painel, de 360 a 960 px (576 na primeira
  vez). O painel reabre na largura escolhida, para qualquer tarefa, e numa janela mais
  estreita ocupa a janela inteira sem perder a largura guardada.
- Abaixo do corpo ficam os **comentários**, do mais antigo ao mais novo, cada um com a
  data e a hora do envio no fuso configurado ("05/11 14:32"). O editor de comentário,
  no fim, é outro editor de blocos: "Comentar" ou Ctrl+Enter envia, e ele fica vazio.
  Ctrl+S continua salvando a tarefa.
- Comentário vazio, ou só com espaços e linhas em branco, não é enviado. Se a API não
  responde, o erro aparece junto do editor e o texto continua nele.
- O ✕ de um comentário pede confirmação; "Apagar comentário" tira ele de vez, e
  "Cancelar" não muda nada.

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
- **A largura é deste navegador**: fica no `localStorage` (`dailly.tasks.panelWidth`),
  gravada ao soltar a borda. Sem storage (janela privada), ela vale até recarregar. Um
  valor guardado fora dos limites é lido como o limite mais próximo.
- **O comentário não é uma Entry** (P4 do PRD): mora em `task_comments` (migration 9),
  vai junto quando a tarefa é apagada e nunca aparece no Daily Log nem no `GET
  /entries` (RN14). O corpo é o markdown do editor.
- `GET /tasks/:key/comments` (por `created_at`, desempate pelo id), `POST` com `{ body }`
  (201) e `DELETE /tasks/:key/comments/:id` (204). Vazio é 400 ("o comentário é
  obrigatório"), e um campo além de `body` é 400 nomeando o campo; a tarefa ou o comentário que não existe, ou o
  comentário de outra tarefa, é 404. A regra do corpo é pura
  (`normalizeCommentBody`) e roda na tela e no servidor.
- Os comentários são lidos num `GET` próprio ao abrir o painel, fora do `GET /tasks`
  (RN4). Depois de enviar ou apagar, a lista é relida (RN7).

# Onde mora

- `packages/tasks-core/src/task-store.ts` (`TaskPatch`, `TaskStore.update`)
- `server/src/modules/tasks/routes.ts` (o `PATCH` parcial),
  `server/src/modules/entries/rows.ts` (`updateEntryRow`)
- `ui/src/modules/tasks/ui/detail/TaskPanel.vue`, `ui/src/modules/tasks/model/draft.ts`
- `ui/src/modules/tasks/model/width.ts` (os limites), `ui/src/modules/tasks/ui/panel-width.ts`
  (a largura lembrada)
- `packages/tasks-core/src/comment.ts`, `ui/src/modules/tasks/ui/detail/TaskComments.vue`
  e `CommentBody.vue`, `ui/src/modules/tasks/model/comment-stamp.ts`

# Entregue

No card #22 (F3 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-05. A borda que
redimensiona, no card #44 (F6), em 2026-11-05. Os comentários, no card #45 (F7), em
2026-11-06.

# Limites

- Não abre pela URL (`/tasks/T-<n>`): o shell não tem rota por URL para módulo nenhum.
- A largura não se ajusta pelo teclado nem volta ao padrão com duplo clique.
- Não avisa ao fechar com mudança não salva, nem salva sozinho.
- Comentário não tem resposta, menção nem edição, e não aparece no card nem na linha.
