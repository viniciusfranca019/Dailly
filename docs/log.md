# Directory Update Log

## 2026-11-09
* **Creation**: [Imagem Docker do dailly](/features/imagem.md) (card #61). [Arquitetura](/conventions/architecture.md) revê a ADR 0012: na imagem, o Fastify serve a UI.
* **Update**: [MCP do dailly](/features/mcp.md) ganha o Daily Log e as labels (card #58).
* **Creation**: [MCP do dailly](/features/mcp.md), as tools do Tasks (card #57). [Arquitetura](/conventions/architecture.md) ganha o projeto `mcp/`, o terceiro cliente da API.
* **Creation**: [Tasks, criar rápido com C](/features/tasks-criar-rapido.md), a F10 do [Tasks](/prd/tasks.md) (card #48), que fecha a v2. A RN8 do [Tasks](/prd/tasks.md) passa a ler "nasce sem quando ninguém escolhe" (P1 do #48), e [Módulos](/conventions/modules.md) ganha o `notify` e o atalho de letra solta.

## 2026-11-06
* **Update**: [Tasks, painel da tarefa](/features/tasks-painel.md) põe as labels globais na tarefa, a F8 do [Tasks](/prd/tasks.md) (card #46). [Arquitetura](/conventions/architecture.md) e [Módulos](/conventions/modules.md) ganham a capacidade `labels`.
* **Creation**: [Tasks, busca com Ctrl+K](/features/tasks-busca.md), a F9 do [Tasks](/prd/tasks.md) (card #47). [Módulos](/conventions/modules.md) ganha a costura de comandos do shell.
* **Creation**: [Tasks, status do board](/features/tasks-status.md), a F5 do [Tasks](/prd/tasks.md) (card #43), com a migration 10. [Tasks, vários boards](/features/tasks-boards.md) deixa de dizer que os status são globais.
* **Update**: [Tasks, painel da tarefa](/features/tasks-painel.md) ganha os comentários, a F7 do [Tasks](/prd/tasks.md) (card #45), com a migration 9.
* **Creation**: [Tasks, vários boards](/features/tasks-boards.md), a F4 do [Tasks](/prd/tasks.md) (card #42): boards com prefixo, a troca e a migration 8. [Módulos](/conventions/modules.md) registra o 8 do tasks.

## 2026-11-05
* **Update**: [Tasks, painel da tarefa](/features/tasks-painel.md) se redimensiona pela borda esquerda, a F6 do [Tasks](/prd/tasks.md) (card #44).
* **Update**: as fatias F4 a F10 do [Tasks](/prd/tasks.md) ganham os cards #42 a #48.
* **Update**: [Tasks](/prd/tasks.md) v2 refinado (`Refinado: sim`) em modo delegado: a P4 fecha em `task_comments`, e a F8 deixa de esperar a Fase 2, que já entrou.
* **Update**: [Daily Log](/features/daily-log.md) filtra a timeline por labels e propriedades, a F4 da [Fase 2](/prd/daily-log-fase-2.md) (card #36), que fecha a fase.
* **Update**: [Daily Log](/features/daily-log.md) ganha propriedades tipadas, a F3 da [Fase 2](/prd/daily-log-fase-2.md) (card #35).
* **Update**: [Daily Log](/features/daily-log.md) ganha labels globais, a F2 da [Fase 2](/prd/daily-log-fase-2.md) (card #34).
* **Update**: [Daily Log](/features/daily-log.md) corrige e apaga registros, a F1 da [Fase 2](/prd/daily-log-fase-2.md) (card #33).
* **Creation**: [Daily Log, Fase 2](/prd/daily-log-fase-2.md), refinado em modo delegado: editar e apagar registro, labels, propriedades e filtros, em quatro fatias. A F8 do [Tasks](/prd/tasks.md) passa a depender da F2 dele.
* **Update**: [Módulos](/conventions/modules.md) e [Arquitetura](/conventions/architecture.md) sem a exceção do entries: o repositório do Daily Log nasce no `provide` do módulo, e a regra pura da tela foi para `model/` (card #29).
* **Creation**: [Ordem da barra lateral](/features/ordem-da-barra.md), reordenar os módulos arrastando ou com Alt+↑/↓ (card #28).
* **Update**: [Tasks](/prd/tasks.md) ganha a v2, dos feedbacks do dono: J5 a J11, RN9 a RN15, F4 a F10, a RN5 reescrita para o prefixo por board. Volta a `Refinado: não` com a P4 aberta.
* **Creation**: [Tasks, painel da tarefa](/features/tasks-painel.md), o F3 do [Tasks](/prd/tasks.md) (card #22).
* **Creation**: [Tasks, board e a troca board/lista](/features/tasks-board.md), o F2 do [Tasks](/prd/tasks.md) (card #21).
* **Creation**: [Tasks, capturar e listar](/features/tasks-capturar-e-listar.md), o F1 do [Tasks](/prd/tasks.md) (card #20).

## 2026-11-04
* **Update**: as fatias do [Tasks](/prd/tasks.md) ganham os cards #20, #21 e #22.
* **Creation**: o tipo `PRD` e a pasta [PRDs](/prd/index.md), com o primeiro rascunho: [Tasks](/prd/tasks.md), o board kanban ou lista em que cada tarefa é uma Entry.
* **Update**: [Tasks](/prd/tasks.md) refinado (`Refinado: sim`), com as recomendações aceitas pelo dono e três fatias.

## 2026-11-02
* **Creation**: o bundle OKF substitui o `docs/` antigo. As treze ADRs viraram as decisões de [Arquitetura](/conventions/architecture.md), cada uma achável pelo número antigo; `mvp.md`, `roadmap.md`, `auditoria-lacunas.md` e `adaptacao-dailly.md` saíram (o git os guarda), e as fases por vir foram para o `TODO.md`.
* **Creation**: [Módulos](/conventions/modules.md), [Versão](/conventions/versioning.md), [OKF neste bundle](/conventions/okf.md) e uma página por feature em [Features](/features/index.md).
