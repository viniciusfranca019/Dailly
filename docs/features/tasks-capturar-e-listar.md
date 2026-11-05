---
type: Feature
title: Tasks, capturar e listar
description: A lista de tarefas agrupada por status, com a captura por título no "+" de cada status e a chave T-<n> que nunca é reaproveitada.
tags: [tasks, entries, lista]
status: stable
since: 0.1.3
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T12:00:00-03:00 }
---

# O que faz

- Tasks mostra os cinco status (Backlog, A fazer, Fazendo, Feito, Cancelado), cada um
  com a contagem e as suas tarefas: a chave `T-<n>`, o título e a prioridade.
- O "+" de um status abre um campo de título. Enter cria a tarefa no topo daquele
  status, com a chave seguinte e prioridade "sem". Esc ou "Cancelar" fecha o campo.
- Sem nenhuma tarefa, a tela mostra "Nenhuma tarefa ainda" e um botão que abre a
  captura em "A fazer".
- Título vazio, ou só com espaços, é recusado com "o título é obrigatório", sem ir ao
  servidor. Se a API não responde, o erro aparece junto do campo e o título digitado
  continua nele.
- Uma tarefa não aparece na timeline do [Daily Log](/features/daily-log.md).

# Regras

- **A tarefa é uma Entry** (PRD RN1): a linha em `entries` ganha `kind = 'task'`, e o
  resto é uma faceta em `tasks`, com o mesmo id. Criar grava as duas numa transação só,
  e apagar a Entry leva a faceta junto.
- **O status tem categoria fixa** (RN2): `backlog`, `unstarted`, `started`, `completed`
  e `canceled`. O v1 não cria, renomeia nem reordena status.
- **A chave nunca é reaproveitada** (RN5): um contador guarda a última dada, então
  apagar a T-2 não devolve o 2 para a próxima.
- **A timeline lê só `kind = 'log'`** (RN6), e só `POST /tasks` cria tarefa: o
  `/entries` continua só de registro.
- A ordem dentro do status é um rank fracionário (`rankBetween`), e a tarefa nova vai
  acima da primeira.

# Onde mora

- `packages/tasks-core/` (a tarefa, os status, a chave, `rankBetween` e a port
  `TaskStore` com a suíte de contrato)
- `server/src/modules/tasks/` (migration 5, o store SQLite, `GET /tasks`,
  `POST /tasks`, `DELETE /tasks/:key`) e `server/src/modules/entries/` (migration 4, a
  coluna `kind`, e `rows.ts`, a costura que o Tasks usa)
- `ui/src/modules/tasks/` (`model/list.ts` e `ui/list/`), `ui/src/adapters/http-tasks-client.ts`

# Entregue

No card #20 (F1 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-05. Exige
`VITE_TASKS=true`, que o `make start` liga desde o [board](/features/tasks-board.md) (F2).

# Limites

- Sem painel, edição ou apagar na tela; isso é o F3 (#22). A API já apaga
  (`DELETE /tasks/T-<n>`).
- A prioridade existe no dado, mas nada na tela a muda ainda; o `completedAt` muda pelo [board](/features/tasks-board.md).
