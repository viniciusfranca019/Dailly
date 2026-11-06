---
type: Feature
title: Tasks, vários boards
description: Criar boards com nome e prefixo próprio, trocar entre eles e voltar no último usado; a chave de cada tarefa é <PREFIXO>-<n>, sequencial no board e congelada.
tags: [tasks, board, prefixo, chave]
status: stable
since: 0.1.17
generated: { by: regulus/claude-opus-5-5, at: 2026-11-06T15:00:00-03:00 }
---

# O que faz

- No topo do Tasks, a **troca de boards** mostra os boards na ordem de criação, com
  "Tasks" primeiro. Trocar mostra só as tarefas daquele board, no board e na lista.
- O **+** ao lado abre "Novo board": nome e prefixo ("Casa", "CASA"). O board novo
  entra na troca e abre já nas cinco colunas, vazio.
- O botão com o prefixo do board atual abre "Editar board": trocar o nome ou o
  prefixo. As tarefas criadas depois ganham o prefixo novo; as que já existiam
  mantêm a chave que tinham (CASA-1 continua CASA-1 quando o board passa a LAR).
- Recarregar volta no último board usado.
- A recusa aparece no formulário, que guarda o que foi digitado:

| Caso | Mensagem |
|------|----------|
| Nome vazio | o nome é obrigatório |
| Prefixo vazio | o prefixo é obrigatório |
| Fora de A–Z e 0–9 | o prefixo usa só letras de A a Z e números |
| Mais de 6 caracteres | o prefixo tem no máximo 6 caracteres |
| Já usado por um board, mesmo que trocado depois | o prefixo X já foi usado por um board |

  O campo do prefixo põe em maiúsculas ao digitar.

# Regras

- **RN5**: a chave é `<PREFIXO>-<n>`, com o `n` sequencial dentro do board e nunca
  reaproveitado, e o prefixo fica congelado na tarefa (`key_prefix`).
- **RN9**: um prefixo que um board usou nunca vai para outro, nem depois de trocado.
  A recusa lê `task_board_prefixes`, onde entra todo prefixo que um board já teve. O
  próprio board pode voltar a um prefixo que já foi dele, porque o contador dele não
  volta e nenhuma chave colide.
- **RN10**: a migration 8 põe as tarefas de antes da v2 no board "Tasks" (id `tasks`,
  prefixo T), com as chaves, os status e as datas que já tinham, e o contador da v1:
  depois de T-9 apagada, a próxima é T-10.
- A regra do prefixo e do nome é pura (`normalizePrefix`, `normalizeBoardName` no
  `@dailly/tasks-core`) e roda na tela e no servidor. A API recusa minúsculas em vez de
  converter, para a regra ficar visível a quem chama.
- `GET /boards`, `POST /boards {name, prefix}` (201) e `PATCH /boards/:id`; o
  formato errado é 400 com o campo, o prefixo já usado é 409, o id que não existe é
  404 "board não encontrado".
- `/tasks` continua o único caminho de uma tarefa: `GET /tasks?boardId=` e o `POST`
  com `boardId` no corpo, sem board padrão escondido no servidor (sem `boardId` é 400).
  `PATCH` e `DELETE /tasks/:key` levam a chave inteira (`CASA-3`).
- O último board usado fica no `localStorage` (`dailly.tasks.board`, lido também pela
  busca e pelo criar rápido); sem storage, ou com um id que sumiu, abre o "Tasks".

# Onde mora

- `packages/tasks-core/src/board.ts` (o board, o prefixo, as recusas), `task.ts`
  (`formatKey`, `parseKey`) e a port `TaskStore`, com a suíte de contrato
- `server/src/modules/tasks/` (migration 8, store SQLite, rotas de board)
- `ui/src/modules/tasks/ui/boards/BoardForm.vue`, `ui/board-choice.ts` e a troca no
  `Tasks.vue`

# Entregue

No card #42 (F4 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-06. Os status próprios
de cada board são da F5; até lá, todo board mostra os cinco status de hoje.

# Limites

- Não move tarefa entre boards, não apaga nem arquiva board, não reordena a troca.
- Não abre um board pela URL: o shell não tem rota por URL para módulo nenhum.
