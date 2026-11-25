---
type: Feature
title: Tasks, filtro por label
description: Ligar labels acima do board mostra só as tarefas com alguma delas, no board e na lista; a tarefa criada com o filtro ligado nasce com as labels dele.
tags: [tasks, labels, filtro, board, lista]
status: stable
since: 0.1.26
generated: { by: regulus/claude-opus-5-5, at: 2026-11-24T12:00:00-03:00 }
---

# O que faz

- Acima do board, as labels globais viram botões, com a cor de cada uma, como na
  timeline do [Daily Log](/features/daily-log.md). Ligar uma mostra só as tarefas com
  ela; ligar outra soma (OU). Vale igual no board e na lista.
- Todas as colunas e grupos de status continuam na tela com o filtro ligado, porque é
  neles que a tarefa nasce e o status se gerencia.
- "Limpar filtro" volta o board inteiro. Se o filtro esconde todas as tarefas, a tela
  diz "nenhuma tarefa com esse filtro", e não o convite "Nenhuma tarefa ainda".
- Criar pelo **+** de uma coluna com o filtro ligado faz a tarefa nascer com as labels
  ligadas, numa gravação só; sem isso ela sumiria da tela ao ser criada.
- Sem nenhuma label existente, a barra não aparece.

# Regras

- OU entre as labels ligadas, a mesma regra da timeline do Daily Log.
- O filtro continua ao trocar de board, porque a label é global (RN13), e não fica salvo
  nem na URL: recarregar volta o board inteiro.
- Uma tarefa que perde a label no painel sai do board na próxima leitura.
- Uma label apagada em outra tela sai do filtro na próxima leitura das labels.
- Arrastar com o filtro ligado continua valendo: o `placeAt` põe a tarefa antes da
  tarefa de destino no board inteiro, então as escondidas não perdem a ordem.
- `POST /tasks` aceita `labelIds` opcional; uma label que não existe é recusada com 400
  em `labelIds` ("contém uma label que não existe") e nada é criado, nem a chave gasta.

# Onde mora

- `ui/src/modules/tasks/model/label-filter.ts` (o corte, sem DOM), `ui/src/modules/tasks/ui/Tasks.vue`
- `ui/src/capabilities/labels/LabelFilter.vue`, os botões que o `FilterBar` do Daily Log
  e o Tasks usam
- `packages/tasks-core` (`NewTask.labelIds`), `server/src/modules/tasks/` (`POST /tasks`),
  `ui/src/adapters/http-tasks-client.ts`

# Entregue

Sem card, pedido direto do dono, em 2026-11-24.

# Limites

- Filtra só por label: prioridade, status e propriedade continuam fora, e não há
  visualização salva (Fora de escopo do [PRD do Tasks](/prd/tasks.md)).
- O criar rápido (C) não herda o filtro: ele abre fora da tela do board.
- O corte é na tela, sobre o board já lido (RN4); um board de milhares de tarefas
  pediria o filtro no `GET /tasks`.
