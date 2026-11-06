---
type: Feature
title: Tasks, status do board
description: Cada board tem os seus status, com cor: adicionar na categoria certa, renomear e trocar a cor, e apagar, levando as tarefas para o topo de outro status.
tags: [tasks, status, board, cor]
status: stable
since: 0.1.19
generated: { by: regulus/claude-opus-5-5, at: 2026-11-06T18:00:00-03:00 }
---

# O que faz

- Cada coluna do board, e cada grupo da lista, mostra a cor do status ao lado do nome,
  com dois botões: ✎ edita e ✕ apaga.
- "+ status", no topo, adiciona um status ao board atual: nome, categoria (backlog, a
  fazer, em andamento, concluída, cancelada) e cor. Ele entra depois dos outros da sua
  categoria: "Revisão", em andamento, fica entre "Fazendo" e "Feito".
- Editar troca o nome e a cor; a categoria não muda depois de criada. As tarefas do
  status ficam onde estavam, com o "concluída em" que tinham.
- Apagar um status sem tarefas só pede confirmação. Com tarefas, a pessoa escolhe para
  qual status elas vão: elas entram no topo dele, na ordem em que estavam, e ganham ou
  perdem o "concluída em" conforme a categoria do destino. "Cancelar" não muda nada.
- Todo board novo nasce com os cinco: Backlog, A fazer, Fazendo, Feito e Cancelado.
- Um board sem tarefa mostra o convite "Nenhuma tarefa ainda" acima das colunas.

| Recusa | Mensagem |
|--------|----------|
| Nome vazio | o nome é obrigatório |
| Nome que já existe no board (sem diferença de maiúsculas) | já existe um status "Feito" neste board |
| Apagar o último status do board | o board precisa de ao menos um status |
| Apagar com tarefas e sem destino (pela API) | o status tem tarefas: escolha para onde elas vão |

# Regras

- **RN2**: as cinco categorias são fixas, e regras e relatórios leem a categoria, nunca
  o nome. Por isso a categoria de um status não se troca (mudaria o "concluída em" de
  tarefas que não se moveram, RN3).
- **RN11**: a ordem das colunas é a das categorias e, dentro delas, a de criação; o
  `position` da resposta é o índice nessa ordem. O board tem ao menos um status.
- **RN12**: apagar com tarefas exige o destino, e o mover e o apagar são uma escrita só.
- A paleta (`STATUS_COLORS`) tem os mesmos oito nomes das labels do Daily Log.
- `POST /boards/:id/statuses {name, category, color}` (201), `PATCH /statuses/:id
  {name?, color?}` e `DELETE /statuses/:id?moveTo=<id>` (204). Formato errado é 400 com
  o campo; nome repetido, último status e status com tarefas sem destino são 409; um
  `moveTo` que é o próprio status, de outro board ou não existe é 400 em `moveTo`.
- Uma tarefa só nasce ou se move num status do próprio board.
- A migration 10 põe os cinco status de antes no board "Tasks" com os mesmos ids, dá
  cinco status próprios a cada board criado depois, e aponta as tarefas para eles, sem
  mudar chave, ordem nem "concluída em".

# Onde mora

- `packages/tasks-core/src/status.ts` (semente, paleta, ordem, recusas), `move.ts`
  (`ranksOnTop`) e a port `TaskStore`, com a suíte de contrato
- `server/src/modules/tasks/` (migration 10, store SQLite, rotas de status)
- `ui/src/modules/tasks/ui/statuses/`, `model/status-colors.ts`

# Entregue

No card #43 (F5 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-06.

# Limites

- Não reordena colunas arrastando, não troca a categoria, não copia os status de um
  board para outro e não move tarefas para o status de outro board.
