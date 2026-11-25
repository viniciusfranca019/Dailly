---
type: Feature
title: Tasks, programas e foco
description: Um programa junta tarefas de qualquer board sob um objetivo e uma janela; o foco põe um programa ou uma tarefa avulsa em P0, P1 ou P2. Duas visões do Tasks, Programas e Foco, e a linha do programa no painel da tarefa.
tags: [tasks, programa, foco, prioridade]
status: stable
since: 0.1.30
generated: { by: regulus/claude-opus-5-5, at: 2026-11-25T12:00:00-03:00 }
---

# O que faz

- O seletor de visão do Tasks ganha **Programas** e **Foco**, ao lado de Board e Lista.
  As duas cruzam todos os boards.
- **Programas** lista cada programa com o objetivo, a janela ("25/11/2026 a 19/12/2026"),
  o "sai quando" e as tarefas dele (chave, título e status). "Novo programa" abre o
  formulário; só o nome é obrigatório. Um campo em cada programa recebe a chave de uma
  tarefa (`LAB-5`) e a põe nele. A chave de uma tarefa da lista abre o painel dela, no
  board dela.
- Cada programa tem o seletor de foco: fora de foco, P0, P1 ou P2.
- **Foco** mostra P0, P1 e P2, cada um com o que está nele, na ordem em que entrou, e
  "Tirar do foco" em cada item. Uma tarefa sem programa entra pela chave e pelo nível.
- O painel de uma tarefa de programa diz o programa ("Dailly v1"), e o nível quando o
  programa está em foco ("foco P0 · Dailly v1").
- No Board e na Lista, acima das colunas, dois filtros ao lado do de label: **programa**
  (um chip por programa) e **foco** (P0, P1 e P2). O de programa mostra as tarefas dos
  programas ligados, com todos os status. O de foco mostra as avulsas do nível e as
  tarefas dos programas do nível, sem as de status concluído ou cancelado. Os chips de
  um filtro somam; os filtros juntos mostram o que passa em todos. "Limpar filtro"
  desliga os três.

| Recusa | Mensagem |
|--------|----------|
| Nome vazio | o nome é obrigatório |
| Fim da janela antes do início | o fim da janela vem depois do início |
| Data fora de AAAA-MM-DD | a data da janela é AAAA-MM-DD |
| Tarefa que já está noutro programa | LAB-5 já está no programa Dailly v1 |
| Tarefa de programa posta em foco | LAB-5 é do programa Dailly v1: ponha o programa em foco |

# Regras

- Os conceitos são os do modelo de atividades do Workstation: o programa é um conjunto
  de tarefas com uma finalidade, numa janela; o foco é o nível de atenção de um programa
  ou de uma tarefa avulsa.
- **O programa guarda as tarefas dele** (RN1 do [PRD do Tasks](/prd/tasks.md)): a tarefa
  não ganha campo. Uma tarefa fica em um programa só.
- **Só entra no foco o que não tem programa**: o programa, ou a tarefa avulsa. A tarefa
  de um programa herda o nível dele. A avulsa em foco que entra num programa perde o
  foco dela, porque passa a valer o do programa.
- O teto de cada nível não é aplicado: a lista mostra quantos itens tem.
- `GET/POST /programs`, `POST /programs/:id/tasks {key}`, `GET /tasks/:key/program`,
  `GET /focus` e `PUT /focus {program | task, level}` (`level: null` tira do foco).
  Recusa de formato é 400 com o campo; tarefa noutro programa e tarefa de programa em
  foco são 409; programa ou tarefa que não existe é 404.
- O filtro de foco esconde o que acabou pela categoria do status (`completed`,
  `canceled`), nunca pelo nome, então renomear "Done" não muda nada. O corte é feito na
  tela, sobre o board, os programas e o foco já lidos. Uma leitura de programas ou de
  foco que falha mostra o erro no lugar dos chips e desliga aquele filtro; o board
  continua.

# Onde mora

- `packages/tasks-core/src/program.ts` (modelo e recusas) e o `TaskStore`, com a suíte de
  contrato
- `server/src/modules/tasks/` (migration 11, store SQLite, rotas)
- `ui/src/modules/tasks/model/scope-filter.ts` (os cortes dos filtros, sem DOM)
- `ui/src/modules/tasks/ui/programs/`, `ui/src/shared/programs.ts`,
  `ui/src/adapters/http-programs-client.ts`

# Entregue

No card LAB-9, em 2026-11-25, numa pilha de dois PRs: a API em 0.1.29 (#65), as telas em 0.1.30. Os filtros de
programa e de foco em 0.1.31 (#68).

# Limites

- Não fecha nem arquiva programa, e não tem resultado, Ativo nem avaliação.
- Não tira uma tarefa de um programa, e não tem programa dentro de programa.
- Não está no MCP.
- Uma tarefa criada com o filtro de programa ou de foco ligado não entra no programa nem no
  foco, então some da tela até o filtro ser limpo.
