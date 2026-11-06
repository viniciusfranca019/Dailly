---
type: Feature
title: Tasks, busca com Ctrl+K
description: Ctrl+K, em qualquer tela, abre a busca de tarefas pela chave ou por parte do título, em todos os boards; escolher abre a tarefa no board dela, com o painel aberto.
tags: [tasks, busca, atalho, shell]
status: stable
since: 0.1.20
generated: { by: regulus/claude-opus-5-5, at: 2026-11-06T19:30:00-03:00 }
---

# O que faz

- **Ctrl+K** (ou ⌘K) abre a busca sobre qualquer tela, com o foco no campo, até
  dentro de um campo de texto: o composer do Daily Log não ganha um "k". Com a busca
  aberta, Ctrl+K só devolve o foco ao campo.
- Digitar a chave ("casa-3", em qualquer caixa) acha a tarefa, mesmo depois de o
  board trocar o prefixo. Digitar parte do título acha as tarefas de todos os boards,
  cada uma com o nome do board.
- Sem resultado, a busca diz "nenhuma tarefa encontrada". Se a API não responde, o
  erro aparece ali, e o texto continua no campo.
- ↑ e ↓ escolhem, Enter ou o clique abre: a tela vai para o Tasks, no board da tarefa,
  com o painel dela aberto. Esc fecha a busca e devolve o foco a quem o tinha.

# Regras

- **A costura de comandos do shell** é a primeira entre a F9 e a F10: o descritor do
  módulo no manifesto declara `commands` (id e atalho), o index do módulo exporta um
  componente por id, e o shell tem um listener de `keydown` em `window` que abre o
  componente numa camada sobre a tela, com as deps do módulo, `navigate` e `close`.
  Um módulo desligado pela flag não registra atalho nenhum. Detalhe em
  [Módulos](/conventions/modules.md).
- **RN15**: um atalho com Ctrl ou ⌘ vale em qualquer foco; um atalho sem eles (o `C`
  da F10) não dispara com o foco num campo, num select ou num bloco editável.
- A busca casa a chave exata, quando o texto tem a forma `<PREFIXO>-<n>`, lida na
  chave congelada da tarefa (RN5), mais as tarefas cujo título contém o texto. A chave
  exata vem primeiro, depois as mais recentes, até 20. `%` e `_` contam como letras.
- Maiúsculas não importam só em A–Z, e acento importa: "cafe" não acha "café", e
  "CAFÉ" também não. É o `LIKE` do SQLite, e o fake da suíte de contrato segue a mesma
  regra (`matchesTitle`).
- `GET /tasks/search?q=` devolve `{results: [{key, keyPrefix, title, boardId,
  boardName}]}`; texto vazio é `{results: []}`, e a tela vazia nem chama a API. A tela
  espera uma pausa entre as teclas e descarta a resposta de um texto que já mudou.
- Escolher uma tarefa torna o board dela o último usado (`dailly.tasks.board`, da F4) e
  deixa o pedido de abertura em `model/open-request.ts`, que o `Tasks.vue` lê; o shell
  não carrega o pedido.

# Onde mora

- `ui/src/shared/command.ts` (o comando, o atalho, a RN15), `ui/src/shell/mount.ts` (o
  listener e a camada), `ui/src/shell/modules.ts` (o comando do Tasks)
- `packages/tasks-core/src/search.ts`, a port `TaskStore.search` e a suíte de contrato
- `server/src/modules/tasks/` (`GET /tasks/search`, o `LIKE` escapado)
- `ui/src/modules/tasks/ui/search/TaskSearch.vue`, `model/open-request.ts`

# Entregue

No card #47 (F9 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-06.

# Limites

- Não busca registros do Daily Log nem o corpo da tarefa, não ignora acento e não tem
  outros comandos (criar é a F10). Não abre a tarefa pela URL.
