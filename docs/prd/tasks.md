---
type: PRD
title: Tasks
description: O módulo de tarefas do dailly, board kanban ou lista como no Linear, com cada tarefa sendo uma Entry, o átomo que projetos, épicos e programas vão agregar depois. A v2 traz vários boards com prefixo próprio, status configuráveis com cor, comentários, labels, busca com Ctrl+K e criação rápida.
tags: [tasks, kanban, entries, prd]
status: draft
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T18:30:00-03:00 }
sources:
  - id: linear-concepts
    resource: https://linear.app/docs/conceptual-model
    title: Linear, modelo conceitual (issues, workflow states, projects, views)
  - id: notion-databases
    resource: https://www.notion.com/help/intro-to-databases
    title: Notion, introdução a databases (páginas com propriedades e views)
---

# Tasks

Refinado em modo delegado: o dono aceitou as recomendações do rascunho (P1 a P8), e a
P9, a métrica, foi fechada pela recomendação que o refinamento achou. O contrato é o PRD
do Regulus (Ficha, Jornadas, Regras, Fora de escopo, Latitude, Fatias); o desenho
técnico que as decisões fixaram está no anexo, abaixo do contrato. Cada fatia tem o seu card
nos issues do repo, aberto pelo `Origem` que aponta para cá.

**A v2** vem dos nove feedbacks do dono depois de usar o F1 a F3 (05/11). Gerada e
refinada em modo delegado, com as recomendações P1 a P3 aceitas e a regra de apagar
status com tarefas aceita pelo dono. Ela acrescenta J5 a J11, RN9 a RN15 e F4 a F10,
reescreve a RN5 e duas linhas do Fora de escopo, e não renumera nada do v1. O
feedback 6, reordenar os módulos da barra lateral, é do shell e não entra aqui (Fora
de escopo).

## Ficha

```
Tipo: feature
Dono: Vinicius
Porquê: o Vinicius anota o que tem a fazer fora do dailly, longe do diário e do Analyse, e quer as tarefas ao lado do dia, como átomos que depois se agrupam em projetos
Métrica: dias úteis por semana com ao menos uma tarefa criada ou concluída no dailly hoje 0 → meta 5 de 5 nas 4 semanas depois de F2 entregue
Refinado: não
```

## Jornadas

```
J1: Capturar uma tarefa
  J1.1 Pessoa abre Tasks                          → vê as tarefas agrupadas por status, na última visualização usada
  J1.2 Pessoa digita um título no "+" de um status e confirma → a tarefa aparece no topo daquele status com a chave T-<n> e prioridade "sem"
  Desvios:
  J1.2a Título vazio                              → recusa com "o título é obrigatório", nada é gravado
  J1.2b A API não responde                        → erro junto do campo, o título digitado continua nele
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

J5: Ter vários boards
  J5.1 Pessoa cria um board com nome e prefixo ("Casa", "CASA") → o board aparece na troca de boards, vazio, com os cinco status padrão
  J5.2 Pessoa troca de board                      → vê só as tarefas dele, e recarregar volta no último board usado
  J5.3 Pessoa cria uma tarefa no board "Casa"     → a tarefa ganha CASA-<n>, sequencial dentro do board
  J5.4 Pessoa troca o prefixo do board para "LAR" → as tarefas novas ganham LAR-<n>, e as que já existiam mantêm a chave que tinham
  Desvios:
  J5.1a Prefixo vazio, fora de A–Z e 0–9, maior que 6 caracteres ou já usado por algum board → recusa com o motivo, nada é gravado
  J5.1b Nome vazio                                → recusa com "o nome é obrigatório"

J6: Configurar os status do board
  J6.1 Pessoa adiciona um status com nome, categoria e cor → vira coluna do board e grupo da lista, junto da sua categoria
  J6.2 Pessoa renomeia o status ou troca a cor    → a coluna e o grupo mostram o nome e a cor novos
  J6.3 Pessoa apaga um status sem tarefas e confirma → a coluna some
  J6.4 Pessoa apaga um status com tarefas         → pede o status para onde elas vão; confirmando, elas vão para o topo dele e a coluna some
  Desvios:
  J6.1a Nome vazio ou já usado por outro status do mesmo board → recusa com o motivo
  J6.3a O status é o último do board              → recusa com "o board precisa de ao menos um status"
  J6.4a Pessoa cancela a escolha do destino       → nada muda

J7: Ajustar o painel
  J7.1 Pessoa arrasta a borda esquerda do painel  → a largura acompanha o mouse, e o painel reabre nessa largura
  Desvios:
  J7.1a Arrasta além do mínimo ou do máximo       → a largura para no limite

J8: Comentar a tarefa
  J8.1 Pessoa escreve um comentário no painel, no editor de blocos, e envia → ele aparece no fim da lista de comentários, com data e hora
  J8.2 Pessoa apaga um comentário e confirma      → ele some da lista
  Desvios:
  J8.1a Comentário vazio                          → nada é enviado
  J8.1b A API não responde                        → erro junto do editor, e o texto continua nele

J9: Rotular a tarefa
  J9.1 Pessoa escolhe uma label existente no painel → a label aparece no card e na linha, com a cor dela
  J9.2 Pessoa digita um nome que não existe e confirma → a label é criada com uma cor e aplicada
  J9.3 Pessoa tira a label                        → ela some do card e da linha
  Desvios:
  J9.2a Nome vazio                                → nada é criado

J10: Achar uma tarefa com Ctrl+K
  J10.1 Pessoa aperta Ctrl+K em qualquer tela     → abre a busca, com o foco no campo
  J10.2 Pessoa digita "CASA-3" ou parte de um título → lista as tarefas que batem, de todos os boards, com a chave e o board
  J10.3 Pessoa escolhe uma                        → abre o Tasks no board dela, com o painel da tarefa aberto
  Desvios:
  J10.2a Nada bate                                → "nenhuma tarefa encontrada"
  J10.1a Pessoa aperta Esc                        → a busca fecha e o foco volta onde estava

J11: Criar rápido pelo teclado
  J11.1 Pessoa aperta C fora de um campo de texto, em qualquer tela → abre um formulário flutuante com título, status e prioridade, no último board usado
  J11.2 Pessoa confirma                           → a tarefa entra no topo do status escolhido, e o formulário fecha
  Desvios:
  J11.1a C dentro de um campo de texto            → digita o C, o formulário não abre
  J11.2a Título vazio                             → recusa com "o título é obrigatório"
  J11.2b A API não responde                       → erro no formulário, e o título continua nele
```

## Regras

```
RN1: Toda tarefa é uma Entry, com o mesmo UUID, e um agregado futuro (projeto, épico, programa) referencia o id da Entry, nunca o contrário, porque o átomo não pode mudar no dia em que um agregado nasce
RN2: Todo status pertence a uma de cinco categorias fixas (backlog, a fazer, em andamento, concluída, cancelada), e regra, ordem de coluna e relatório leem a categoria, nunca o nome, porque renomear "Feito" não pode quebrar o Analyse nem um rollup de projeto
RN3: Entrar numa categoria concluída ou cancelada carimba o instante de conclusão, e sair dela o apaga, porque "o que fechei no período" lê esse instante
RN4: Board e lista são a mesma consulta, na mesma ordem; só a forma muda, porque a troca é de visualização, não de dado
RN5: A chave é <PREFIXO>-<n>, com o n sequencial dentro do board e nunca reaproveitado depois de apagar, e fica congelada na tarefa: trocar o prefixo do board vale só para as tarefas novas, porque uma chave citada no Daily Log não pode passar a apontar outra tarefa
RN6: A timeline do Daily Log mostra só as entries de registro, nunca as de tarefa, porque uma tarefa não é um fato do dia até ser concluída, e isso é decisão do Analyse
RN7: Uma gravação recusada faz a tela reler e voltar ao que o servidor tem, porque é a regra que o Requests já usa (reler é voltar) e evita desfazer à mão
RN8: A prioridade é um de cinco níveis (sem, urgente, alta, média, baixa) e toda tarefa nasce "sem", porque são os níveis do Linear e o Analyse lê um inteiro de 0 a 4
RN9: Um prefixo usado por um board nunca é usado por outro, nem depois de trocado, porque as chaves congeladas com ele (RN5) colidiriam com as do board novo
RN10: As tarefas de antes da v2 ficam num board "Tasks" de prefixo T, com as chaves e os status que já tinham, porque T-<n> já pode estar citada no Daily Log
RN11: Todo status pertence a um board, e o board tem ao menos um; o nome é único no board e a coluna fica junto da categoria (RN2), na ordem em que o status foi criado, porque a tarefa precisa de uma coluna e duas colunas com o mesmo nome não se distinguem
RN12: Apagar um status com tarefas pede o status de destino e só apaga depois de movê-las, porque nenhuma tarefa pode ficar sem status
RN13: Uma label é global, a mesma para tarefas e registros do dia, com nome único e uma cor, porque é a label que a Fase 2 do Daily Log vai usar, e duas listas de labels divergiriam
RN14: Um comentário pertence a uma tarefa, usa o editor de blocos e o formato de corpo das Entries, e nunca aparece na timeline do Daily Log, porque o comentário é conversa sobre a tarefa, não fato do dia (RN6)
RN15: Os atalhos de uma letra (C) só valem fora de um campo de texto, e Ctrl+K vale em qualquer lugar, porque uma letra digitada num campo é texto
```

## Fora de escopo

```
Não tem projeto, épico, programa, ciclo nem sub-tarefa, porque são agregados que vêm depois, e o átomo não carrega campo para nenhum deles (RN1)
Não tem responsável nem time, porque o dailly é o diário de uma pessoa só
Não reordena colunas arrastando, porque a ordem vem da categoria e da criação (RN11); criar, renomear, colorir e apagar status entraram na v2 (J6), já que o dono pediu e a categoria fixa (RN2) mantém o Analyse a salvo
Não tem filtros compostos nem visualizações salvas, porque dependem de propriedades, que são a Fase 2 do Daily Log; as labels entraram na v2 (J9, RN13) e a Fase 2 parte delas
Não move uma tarefa entre boards, porque a chave é do board (RN5) e mudar de board mudaria a chave citada
Não apaga nem arquiva board, porque apagar levaria as tarefas e as chaves junto, e o uso ainda não pediu
Não tem resposta encadeada, menção nem edição de comentário, porque o diário é de uma pessoa só e apagar e escrever de novo cobre o erro de digitação
Não reordena os módulos da barra lateral, porque é do shell e vale para todos os módulos; é um card próprio, fora deste PRD
Não tem vencimento nem lembrete, porque lembrete pede notificação e o app só existe com a aba aberta, e sem lembrete a data só pintaria o card
Não sincroniza com o Linear nem com o Notion, porque o dailly é local-first (era a ADR 0001)
Não mostra tarefa na timeline do Daily Log, porque a timeline é o registro do dia (RN6)
```

## Latitude de produto

```
Quando escolher texto, ícone, cor, espaçamento e atalho de teclado → decido, seguindo o Linear
Quando escolher o desenho do card (o que aparece nele além do título e da chave) → decido, seguindo o Linear
Quando a escolha pedir uma dependência nova (drag-and-drop, lib de componentes) → paro e pergunto ao Dono
Quando mudar uma regra RN → paro e pergunto ao Dono
Quando mudar o núcleo da Entry além da coluna `kind` → paro e pergunto ao Dono
Quando o drag-and-drop nativo não der conta do uso → paro e pergunto ao Dono antes de trazer uma lib
Quando escolher a paleta de cores de status e label, e os limites de largura do painel → decido, seguindo o Linear
Quando um atalho precisar trocar de módulo (J10.3, J11.1) → decido por uma costura no shell, em que o módulo contribui comandos pelo manifesto, sem rota por URL, que é o TAIL T1
Quando a migration reconstruir uma tabela do Tasks mantendo toda linha, chave e status → decido
Quando a migration precisar reescrever a tabela `entries` → paro e pergunto ao Dono
```

## Fatias

```
F1: Capturar e listar      — cobre J1.1, J1.1a, J1.2, J1.2a, J1.2b, RN1, RN2, RN5, RN6                — depende de —      → #20
F2: Board e a troca        — cobre J2.1, J2.1a, J2.2, J2.3, J3.1, J3.1a, J3.2, RN3, RN4, RN7    — depende de F1     → #21
F3: Painel da tarefa       — cobre J4.1, J4.1a, J4.2, J4.2a, J4.3, J4.3a, RN7, RN8              — depende de F1     → #22
F4: Vários boards          — cobre J5.1, J5.1a, J5.1b, J5.2, J5.3, J5.4, RN5, RN9, RN10          — depende de F3     → a criar
F5: Status do board        — cobre J6.1, J6.1a, J6.2, J6.3, J6.3a, J6.4, J6.4a, RN2, RN11, RN12 — depende de F4     → a criar
F6: Painel redimensionável — cobre J7.1, J7.1a                                                    — depende de F3     → a criar
F7: Comentários            — cobre J8.1, J8.1a, J8.1b, J8.2, RN14                                — depende de F3     → a criar
F8: Labels                 — cobre J9.1, J9.2, J9.2a, J9.3, RN13                                 — depende de F3     → a criar
F9: Busca com Ctrl+K       — cobre J10.1, J10.1a, J10.2, J10.2a, J10.3, RN15                     — depende de F4     → a criar
F10: Criar rápido          — cobre J11.1, J11.1a, J11.2, J11.2a, J11.2b, RN15                    — depende de F4     → a criar
```

F1 entrega a lista antes do board de propósito: board e lista são a mesma consulta (RN4),
e com ela o núcleo da Entry, a faceta e a chave chegam num PR que ainda não tem
drag-and-drop; a troca entre as duas e o board como padrão chegam em F2. F2 e F3 correm
em paralelo depois de F1. Labels nas tarefas não são fatia ainda: viram uma jornada
quando a Fase 2 do Daily Log fixar o que é uma label, e a fatia delas depende dela.

**Na v2** a ordem se inverte: a F8 fixa o que é uma label (RN13) antes da Fase 2, que
passa a partir dela. A F4 vem primeiro porque o board é o dono do status (F5), e a busca
(F9) e a criação rápida (F10) mostram e escolhem um board. A F6, a F7 e a F8 só dependem
do painel do F3, que já está na `main`, e podem começar junto com a F4. A F9 e a F10
dividem a costura de atalhos do shell: a que entrar primeiro cria a costura, e a outra a
usa.

## Refinamento

```
P4: Onde mora o comentário? A) uma Entry com kind 'comment', ligada à tarefa B) uma tabela do Tasks, task_comments, com o mesmo formato de corpo e o mesmo editor de blocos das Entries — recomendo B, porque a coluna kind nasceu com CHECK (kind IN ('log','task')), e o SQLite só muda um CHECK reconstruindo a tabela entries inteira, o que a Latitude manda parar; B entrega o mesmo molde na tela sem tocar no diário
```

---

# Anexo: o desenho que o refinamento fixou

Fora do contrato. O que cada decisão do refinamento virou:

| Decisão | Ficou | Descartado |
|---------|-------|------------|
| Como a tarefa é uma Entry | núcleo + faceta: `kind` na Entry, o resto numa tabela do Tasks | tudo em `props` (`json_extract` em toda coluna, categoria sem CHECK); o motor de propriedades do Notion antes da Fase 2; tabela `tasks` sem Entry |
| Título | na faceta, obrigatório; o corpo da Entry é a descrição | no núcleo (migration no log sem ganho); primeira linha do corpo |
| Status | cinco fixos, semeados (Backlog, A fazer, Fazendo, Feito, Cancelado) | editáveis no v1 |
| Prioridade | entra, de 0 a 4 (RN8) | só status |
| Vencimento | fica de fora | data sem lembrete |
| Drag-and-drop | nativo do HTML5, a regra de ordem no `model/` puro | SortableJS ou vue-draggable-plus (dependência nova) |
| Visualização lembrada | `localStorage`, com try/catch, board como padrão | preferência no servidor |
| Ordem com a Fase 2 | F1 a F3 antes; labels nas tarefas depois da Fase 2 | Fase 2 antes |
| Métrica | dias úteis com tarefa criada ou concluída, lida do próprio SQLite (`created_at` e `completed_at`) | fração das tarefas pessoais no dailly, que pede contar um lugar que o dailly não vê |

## O que veio de onde

| Ideia | De onde | Como entra |
|-------|---------|------------|
| Status com categoria fixa | Linear (workflow states) | RN2, tabela de status |
| Chave legível ao lado do UUID | Linear (`ENG-123`) | RN5, `T-<n>` |
| Prioridade de 0 a 4 | Linear | RN8 |
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
| `task_statuses` (Tasks) | `id`, `name`, `category` com CHECK nas cinco, `position`; semeada com os cinco status fixos |
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

## A v2: o que as decisões fixaram

| Decisão | Ficou | Descartado |
|---------|-------|------------|
| Chave ao trocar o prefixo (P1) | congelada na tarefa, o prefixo novo vale para as novas (RN5) | renomear todas as chaves do board, que quebraria a chave citada no Daily Log |
| Prefixo de um board antigo | reservado para sempre (RN9) | livre depois de trocado, que deixaria `CASA-3` apontar duas tarefas |
| Labels (P2) | globais, as da Fase 2 do Daily Log (RN13) | por board, que criaria uma segunda lista de labels para a Fase 2 conciliar |
| Atalho de criar (P3) | `C` fora de campo de texto, como no Linear (RN15) | Ctrl+N, Ctrl+T e Ctrl+W, que o navegador toma antes da página |
| Status com tarefas apagado | pede o destino e move antes (RN12, aceita pelo dono) | apagar junto, ou recusar sempre |
| Atalho fora do Tasks | costura no shell: o manifesto do módulo contribui comandos | rota por URL (TAIL T1), maior que o pedido |

**Os dados, para o refinamento dos cards.** As migrations pegam os próximos números
livres do `user_version` (hoje 1 a 5 tomados).

| Onde | O quê |
|------|-------|
| `task_boards` (Tasks, F4) | `id`, `name`, `prefix` único, `counter`, e os prefixos já usados numa tabela própria para a RN9; semeada com "Tasks"/`T`, que herda o `task_counter` (RN10) |
| `tasks` (Tasks, F4) | ganha `board_id` e `key_prefix`; a unicidade passa de `key` para `(board_id, key)`, o que reconstrói a tabela `tasks` mantendo toda linha (Latitude: decido) |
| `task_statuses` (Tasks, F5) | ganha `board_id` e `color`; os cinco de hoje passam para o board "Tasks", e cada board novo é semeado com os cinco |
| `labels`, `entry_labels` (Entries, F8) | os nomes que o `entries/migrations.ts` já reservou para a Fase 2; `Entry.labelIds` já existe no domínio e passa a ser gravado |
| comentários (F7) | depende da P4 |
