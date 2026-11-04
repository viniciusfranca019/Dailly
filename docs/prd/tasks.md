---
type: PRD
title: Tasks
description: O módulo de tarefas do dailly, board kanban ou lista como no Linear, com cada tarefa sendo uma Entry, o átomo que projetos, épicos e programas vão agregar depois.
tags: [tasks, kanban, entries, prd]
status: draft
generated: { by: regulus/claude-opus-5-5, at: 2026-11-04T19:20:00-03:00 }
sources:
  - id: linear-concepts
    resource: https://linear.app/docs/conceptual-model
    title: Linear, modelo conceitual (issues, workflow states, projects, views)
  - id: notion-databases
    resource: https://www.notion.com/help/intro-to-databases
    title: Notion, introdução a databases (páginas com propriedades e views)
---

# Tasks

Rascunho escrito em modo delegado, com o dono fora: cada pergunta que a entrevista do
`/generate-prd` faria virou um `P` em Refinamento, com opções e a recomendação. O
contrato é o PRD do Regulus (Ficha, Jornadas, Regras, Fora de escopo, Latitude,
Fatias, Refinamento). As Fatias entram como **proposta**, porque o dono pediu uma
proposta inteira; o `/refine-prd` as confirma ou corta de novo. O desenho técnico que
sustenta as recomendações está no anexo, abaixo do contrato.

## Ficha

```
Tipo: feature
Dono: Vinicius
Porquê: o Vinicius anota o que tem a fazer fora do dailly, longe do diário e do Analyse, e quer as tarefas ao lado do dia, como átomos que depois se agrupam em projetos
Métrica: tarefas pessoais registradas no dailly hoje 0 → meta: todas as da semana em 30 dias (P9)
Refinado: não
```

## Jornadas

```
J1: Capturar uma tarefa
  J1.1 Pessoa abre Tasks                          → vê as tarefas agrupadas por status, na última visualização usada
  J1.2 Pessoa digita um título no "+" de uma coluna e confirma → a tarefa aparece no topo daquela coluna com a chave T-<n>
  Desvios:
  J1.2a Título vazio                              → recusa com "o título é obrigatório", nada é gravado
  J1.2b A API não responde                        → erro na coluna, o título digitado continua no campo
  J1.1a Nenhuma tarefa ainda                      → estado vazio com o convite para criar a primeira

J2: Andar com a tarefa no board
  J2.1 Pessoa arrasta o card para outra coluna    → o status muda, e o card fica onde foi solto depois de recarregar
  J2.2 Pessoa arrasta o card dentro da coluna     → a ordem nova persiste depois de recarregar
  J2.3 Pessoa solta o card em "Feito"             → o card mostra "concluída em <dia>"
  Desvios:
  J2.1a A gravação falha                          → o card volta para onde estava, com a mensagem do erro

J3: Trocar a visualização
  J3.1 Pessoa alterna para Lista                  → as mesmas tarefas, em linhas agrupadas por status com a contagem, na mesma ordem do board
  J3.2 Pessoa recarrega a página                  → volta na visualização que estava
  Desvios:
  J3.1a Nenhuma tarefa                            → o mesmo estado vazio de J1.1a, nas duas visualizações

J4: Detalhar a tarefa
  J4.1 Pessoa clica no card ou na linha           → abre o painel com título, status, prioridade e o corpo no editor de blocos
  J4.2 Pessoa edita e salva (Ctrl+S)              → o card e a linha mostram a mudança
  J4.3 Pessoa apaga e confirma                    → a tarefa some das duas visualizações
  Desvios:
  J4.2a Título apagado no painel                  → recusa com "o título é obrigatório"
  J4.3a Pessoa cancela a confirmação              → nada muda
  J4.1a A URL aponta uma chave que não existe (/tasks/T-99) → "tarefa não encontrada", com o caminho de volta ao board
```

## Regras

```
RN1: Toda tarefa é uma Entry, com o mesmo UUID, e um agregado futuro (projeto, épico, programa) referencia o id da Entry, nunca o contrário, porque o átomo não pode mudar no dia em que um agregado nasce
RN2: Todo status pertence a uma de cinco categorias fixas (backlog, a fazer, em andamento, concluída, cancelada), e regra, ordem de coluna e relatório leem a categoria, nunca o nome, porque renomear "Feito" não pode quebrar o Analyse nem um rollup de projeto
RN3: Entrar numa categoria concluída ou cancelada carimba o instante de conclusão, e sair dela o apaga, porque "o que fechei no período" lê esse instante
RN4: Board e lista são a mesma consulta, na mesma ordem; só a forma muda, porque a troca é de visualização, não de dado
RN5: A chave T-<n> é sequencial e nunca é reaproveitada depois de apagar, porque uma chave citada no Daily Log não pode passar a apontar outra tarefa
RN6: A timeline do Daily Log mostra só as entries de registro, nunca as de tarefa, porque uma tarefa não é um fato do dia até ser concluída, e isso é decisão do Analyse
RN7: Uma gravação recusada faz a tela reler e voltar ao que o servidor tem, porque é a regra que o Requests já usa (reler é voltar) e evita desfazer à mão
```

## Fora de escopo

```
Não tem projeto, épico, programa, ciclo nem sub-tarefa, porque são agregados que vêm depois, e o átomo não carrega campo para nenhum deles (RN1)
Não tem responsável nem time, porque o dailly é o diário de uma pessoa só
Não cria, renomeia nem reordena status no v1, porque cinco status fixos cobrem o uso e o editor de workflow é o que mais pesa no Linear (P3)
Não tem filtros compostos nem visualizações salvas, porque dependem de labels e propriedades, que são a Fase 2 do Daily Log
Não tem vencimento nem lembrete, porque lembrete pede notificação e o app só existe com a aba aberta (P5)
Não sincroniza com o Linear nem com o Notion, porque o dailly é local-first (era a ADR 0001)
Não mostra tarefa na timeline do Daily Log, porque RN6
```

## Latitude de produto

```
Quando escolher texto, ícone, cor, espaçamento e atalho de teclado → decido, seguindo o Linear
Quando escolher o desenho do card (o que aparece nele além do título e da chave) → decido, seguindo o Linear
Quando a escolha pedir uma dependência nova (drag-and-drop, lib de componentes) → paro e pergunto ao Dono
Quando mudar uma regra RN → paro e pergunto ao Dono
Quando mudar o núcleo da Entry além do que P1 decidir → paro e pergunto ao Dono
```

## Fatias

Proposta, a confirmar no `/refine-prd`.

```
F1: Capturar e listar      — cobre J1.1, J1.1a, J1.2, J1.2a, J1.2b, RN1, RN2, RN5, RN6                — depende de —      → a criar
F2: Board e a troca        — cobre J2.1, J2.1a, J2.2, J2.3, J3.1, J3.1a, J3.2, RN3, RN4, RN7    — depende de F1     → a criar
F3: Painel da tarefa       — cobre J4.1, J4.1a, J4.2, J4.2a, J4.3, J4.3a                        — depende de F1     → a criar
```

F1 entrega a lista antes do board de propósito: board e lista são a mesma consulta (RN4),
e com ela o núcleo da Entry, a faceta e a chave chegam num PR que ainda não tem
drag-and-drop; a troca entre as duas e o board como padrão chegam em F2. F2 e F3 correm
em paralelo depois de F1. Labels nas tarefas não são fatia ainda: viram uma jornada
quando a Fase 2 do Daily Log fixar o que é uma label, e a fatia delas depende dela.

## Refinamento

```
P1: Como uma tarefa "é" uma Entry?
  A) Núcleo + faceta: a Entry ganha `kind` (log | task); o que é só de tarefa (título, status, prioridade, ordem, chave, conclusão) mora numa tabela do módulo Tasks, uma linha por Entry
  B) Mesma tabela, tudo em `props`: a tarefa é uma Entry com status e prioridade dentro do JSON
  C) O Notion inteiro: coleções com schema de propriedades, e o board é uma view agrupada por uma propriedade select
  D) Agregado próprio: uma tabela `tasks` independente, que só imita a forma da Entry
  — recomendo A, porque mantém um átomo só (RN1: um projeto amanhã agrega tarefas e registros pelo mesmo id, como uma relation do Notion), tipa o que o board consulta e ordena (B faz `json_extract` em toda coluna e a categoria do status vira texto sem CHECK), cabe no corte por módulo (a faceta e a migration são do Tasks), e não constrói o motor de propriedades antes da Fase 2 dizer como ele é (C); D contradiz o pedido. O custo: criar tarefa grava em duas tabelas de dois módulos, e isso pede a costura do anexo

P2: Onde mora o título da tarefa?
  A) Na faceta, campo obrigatório; o corpo da Entry é a descrição
  B) No núcleo da Entry, opcional para todo kind
  C) Derivado da primeira linha do corpo, como o Daily Log faz
  — recomendo A, porque o card precisa de título curto e editável sem abrir o editor de blocos (o Linear separa os dois), e o Daily Log já deriva o dele, então pôr no núcleo pediria uma migration no log sem ganho. Revisitar em B quando um agregado precisar listar membros de kinds diferentes pelo nome

P3: Os status são fixos ou editáveis no v1?
  A) Fixos, cinco linhas semeadas pela migration (Backlog, A fazer, Fazendo, Feito, Cancelado), uma por categoria
  B) Editáveis: criar, renomear e reordenar colunas dentro das categorias
  — recomendo A, porque a tabela de status já nasce com a categoria (RN2), então B depois é só tela, sem migration nem dado a converter

P4: Prioridade entra no v1?
  A) Sim, os cinco níveis do Linear (sem, urgente, alta, média, baixa), mostrada no card e na linha
  B) Não, só status
  — recomendo A, porque é um inteiro de 0 a 4 sem tabela, e é o segundo eixo que a lista ordena e o Analyse vai querer ler

P5: Vencimento entra no v1?
  A) Não
  B) Sim, uma data sem hora, mostrada no card, sem lembrete
  — recomendo A, porque sem lembrete ele só pinta o card, e entra como campo novo da faceta sem tocar no resto

P6: Como o drag-and-drop é feito?
  A) DnD nativo do HTML5, com a regra de ordem num `model/` puro que recebe "solto entre X e Y"
  B) Uma lib (SortableJS ou vue-draggable-plus)
  — recomendo A, porque dependência nova é `→ paro` na Latitude, e com a regra no model puro o teste cobre o que importa sem simular arrasto no jsdom; o custo é escrever à mão a área de soltura e o realce. Se a mão ficar ruim, B troca só a `ui/`

P7: Onde fica lembrada a visualização (board ou lista)?
  A) No `localStorage` do navegador, com try/catch e board como padrão
  B) No servidor, como preferência gravada
  — recomendo A, porque é preferência de quem olha, uma pessoa num navegador, e B nasce de verdade quando existir a visualização salva (Fora de escopo)

P8: Em que ordem com a Fase 2 do Daily Log (labels, propriedades, filtros)?
  A) Tasks F1 a F3 primeiro, a Fase 2 depois, e labels nas tarefas por último
  B) Fase 2 primeiro, e Tasks já nasce com labels
  — recomendo A, porque F1 a F3 não leem label nem propriedade, e a Fase 2 fica mais bem desenhada com dois consumidores (log e tarefa) na mesa do que com um

P9: Onde as tarefas pessoais vivem hoje, e qual meta mede o Tasks? — aberta
```

---

# Anexo: o desenho por trás das recomendações

Fora do contrato. Vale enquanto P1 = A; se o dono escolher outra, este anexo é refeito.

## O que veio de onde

| Ideia | De onde | Como entra |
|-------|---------|------------|
| Status com categoria fixa | Linear (workflow states) | RN2, tabela de status |
| Chave legível ao lado do UUID | Linear (`ENG-123`) | RN5, `T-<n>` |
| Prioridade de 0 a 4 | Linear | P4 |
| Board e lista sobre a mesma consulta | Linear (display options) | RN4 |
| Ordem manual dentro da coluna | Linear (ordenação manual) | J2.2, `rank` por índice fracionário |
| A tarefa é uma página com corpo livre | Notion (página de database) | o corpo da Entry no editor de blocos |
| Agrupar por relação, não por pasta | Notion (relations) | RN1, o agregado aponta o id |
| View salva com filtro e agrupamento | Notion e Linear | depois, Fora de escopo |

## O átomo e o agregado

A Entry é o átomo; o Tasks acrescenta uma faceta a ela, e um agregado futuro só aponta
ids. Um exemplo do próprio diário: o projeto "Cofre de segredos" agruparia a tarefa
`T-4 Tela de destravar` **e** o registro do dia em que a chave de recuperação foi
testada, porque os dois são Entries. Nenhum dos dois ganha um campo `project_id`: é o
projeto que guarda a lista.

```
packages/domain          Entry { id, kind: 'log' | 'task', body, occurredAt, createdAt, updatedAt, labelIds, props }
packages/tasks-core      TaskFacet { entryId, key, title, statusId, priority, rank, completedAt }
                         StatusCategory = backlog | unstarted | started | completed | canceled
                         rankBetween(antes, depois): string   (índice fracionário, puro)
                         transition(facet, status, agora)     (RN3: carimba ou apaga completedAt)
depois, sem tocar acima  Project { id, name, memberIds: EntryId[] }   (ou Epic, Program…)
```

**Por que um agregado aponta o id e não o contrário.** Se a tarefa carregasse
`projectId`, o épico pediria `epicId`, o programa `programId`, e o átomo mudaria a cada
agregado novo. Com o agregado guardando a lista, cada um nasce com a própria tabela de
membros e a própria regra de cardinalidade (uma tarefa em um projeto só, como no
Linear, ou em vários, como no Notion), decidida quando ele nascer, sem migration nas
tarefas.

**Qual `occurredAt` uma tarefa tem.** O instante da criação, como no log. O fato que o
Analyse quer de uma tarefa é a conclusão, e esse mora na faceta (`completedAt`, RN3).
Assim o recorte por período do log continua lendo `occurredAt`, e o de tarefas lê
`completedAt`, sem um campo com dois sentidos.

## Os dados

As migrations pegam os próximos números livres do `user_version` quando forem escritas
(hoje 1 a 3 estão tomados), como o `entries/migrations.ts` manda: reservar não é tomar.

| Onde | O quê |
|------|-------|
| `entries` (módulo Entries) | coluna `kind TEXT NOT NULL DEFAULT 'log' CHECK (kind IN ('log','task'))`, e a timeline passa a filtrar `kind = 'log'` (RN6) |
| `task_statuses` (Tasks) | `id`, `name`, `category` com CHECK nas cinco, `position`; semeada com os cinco de P3 |
| `tasks` (Tasks) | `entry_id` PK e FK para `entries(id)` com `ON DELETE CASCADE`, `key INTEGER UNIQUE`, `title`, `status_id`, `priority` 0 a 4, `rank TEXT`, `completed_at`; índice `(status_id, rank)` para a coluna do board |
| `task_counter` (Tasks) | uma linha com o último `key` dado, para RN5 sobreviver a apagar a maior |

**A costura entre os dois módulos.** Criar tarefa grava uma linha em `entries` e uma em
`tasks`, numa transação só. O módulo Tasks não alcança o SQLite do Entries por dentro
(`server/src/architecture.test.ts` só deixa um módulo ver o contrato e o `index.ts` do
outro). A saída é o Entries exportar pelo `index.ts` uma função que grava a Entry
recebendo a transação, e o Tasks abrir a transação com o `db` do `ProvideContext`. Ela
mexe no mesmo `entries` que o passo 4 do foco (levar o SQLite das entries para dentro do
módulo via `provide`), e por isso os dois andam em série.

## Os módulos

O passo a passo é o de [Módulos](/conventions/modules.md), sem exceção:

- `packages/tasks-core`: a faceta, as categorias, `rankBetween`, `transition` e a port
  `TaskStore` com a suíte de contrato.
- `server/src/modules/tasks/`: migrations, rotas (`GET /tasks`, `POST /tasks`,
  `PATCH /tasks/:key`, `DELETE /tasks/:key`) e o `provide` com o `TaskStore` SQLite.
- `ui/src/modules/tasks/`: `model/` (agrupar por status, mover, a visualização
  escolhida) e `ui/` por pedaço (`board/`, `list/`, `detail/`), atrás de `VITE_TASKS`
  nos alvos `dev-all`, `test-all` e `build-all`. O corpo usa a capacidade do whiteboard,
  como o Daily Log.
- Pronto quando a página em [Features](/features/index.md) existe e o `VERSION` sobe.
