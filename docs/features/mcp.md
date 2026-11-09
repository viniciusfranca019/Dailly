---
type: Feature
title: MCP do dailly
description: Um servidor MCP por stdio para o Claude Code operar o dailly, lendo boards e criando, mudando, movendo e apagando tarefas e comentários pela API local, como mais um cliente dela.
tags: [mcp, tasks, harness, claude-code]
status: stable
since: 0.1.23
generated: { by: regulus/claude-opus-5-5, at: 2026-11-09T15:30:00-03:00 }
---

# O que faz

- O Claude Code acha o servidor `dailly` pelo `.mcp.json` da raiz (ou pelo escopo de
  usuário, linha no README) e o sobe com `make mcp`, por stdio.
- Tools do Tasks:
  - **ler:** `list_boards`, `get_board` (status e tarefas, na ordem da tela) e
    `search_tasks` (pela chave ou por parte do título, em todos os boards);
  - **escrever:** `create_task`, `update_task` (título, corpo, prioridade e status,
    numa gravação), `delete_task`;
  - **comentários:** `list_comments`, `add_comment`, `delete_comment`.
- Um board ou status é dado pelo nome, sem caixa, ou pelo id; uma tarefa, pela chave
  (`casa-2` vale). Sem board, a tarefa vai para o primeiro ("Tasks"); sem status, para
  o primeiro "a fazer"; sem prioridade, nasce "sem" (RN8).
- Mudar o status põe a tarefa no topo do status novo, e a conclusão é carimbada como na
  tela (RN3).
- Uma recusa da API volta como erro da tool, nas palavras dela ("o título é
  obrigatório"). Com a API fora, a tool diz "não consegui falar com a API local em
  <url>", e o servidor MCP continua de pé. A API que aceita a conexão e não responde
  (um processo suspenso) dá o mesmo erro em 10 s.

# Regras

- **Um cliente da API, não um atalho para o banco.** O `mcp/` fala HTTP com a API, como a
  `ui/`, e importa só `packages/`. Os use-cases rodam no cliente e a API valida
  ([Arquitetura](/conventions/architecture.md)); o `architecture.test.ts` prende as
  setas.
- **Diário padrão:** o de verdade (`http://127.0.0.1:4318`, `make start`).
  `DAILLY_API_URL` aponta para o de dev (`:4317`). A API tem de estar de pé.
- **Destrutivo é marcado.** `delete_task` e `delete_comment` levam `destructiveHint`,
  e as que só leem, `readOnlyHint`; o Claude Code pede permissão por tool.
- **Mover usa o `placeAt`** do `@dailly/tasks-core`, o mesmo da tela: a regra da ordem
  tem um lugar só.
- O cliente HTTP é próprio, e não os adapters da `ui/` (as setas não deixam). O
  `e2e/mcp-tasks.test.ts` o roda contra o Fastify de verdade, então um campo renomeado
  de um lado quebra ali.
- Nada além do protocolo sai no stdout: o `make mcp` é silencioso, e o log vai para o
  stderr.

# Onde mora

- `mcp/src/main.ts` (stdio), `server.ts` (a fábrica), `api.ts` (o cliente),
  `tasks.ts` (as tools), `testing.ts` (o cliente MCP em memória dos testes)
- `.mcp.json`, o alvo `mcp` do `Makefile`
- `e2e/mcp-tasks.test.ts`, `mcp/src/server.test.ts`

# Entregue

No card #57, em 2026-11-09.

# Limites

- Não cria nem edita boards e status: isso fica na tela.
- Não expõe o Requests nem o cofre.
- O Daily Log e as labels, inclusive as das tarefas, entram no card #58.
