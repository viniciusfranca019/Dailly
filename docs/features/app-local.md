---
type: Feature
title: App local
description: O dailly roda no navegador desta máquina, com o diário de verdade no make start, o de desenvolvimento no make dev, e uma API que só aceita esta máquina.
tags: [app, local, seguranca, dados]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- `make start` builda com o Requests ligado e abre o app de verdade em
  http://localhost:4173, com a API em `127.0.0.1:4318` e o diário em
  `~/.config/dailly/dailly.sqlite`.
- `make dev` sobe a API em `:4317` com `server/dailly.dev.sqlite` e o app em
  http://localhost:5173 (mais o `/playground/`), só com os módulos prontos; `make dev-all`
  liga todos.
- Os dois modos usam portas e bancos diferentes, e rodam juntos.
- `make clean-db` apaga o banco de dev; `make clean-db-app` apaga o diário de verdade e
  pede que se digite "apagar"; `make clean` não toca em banco nenhum.
- Um pedido de outro site ou de outro Host recebe 403: "só esta máquina fala com a API".

# Regras

- A guarda é um hook `onRequest` do shell, sem exceção nem para o `/health`: o `Host`
  tem de ser `localhost`, `127.0.0.1` ou `[::1]` (contra DNS rebinding), e um `Origin`,
  quando vem, também (contra CSRF); `Origin: null` é recusado.
- O proxy do Vite repassa o `Host` (`changeOrigin: false`); sem isso, a guarda não
  valeria no caminho do app. O `ui/src/proxy.test.ts` prende isso.
- A API escuta em loopback; `0.0.0.0` poria o diário na rede.
- Cada banco é um arquivo SQLite (WAL, `foreign_keys = ON`). O schema sobe por
  `PRAGMA user_version` numa sequência global (1 entries, 2 requests, 3 cofre), cada
  versão numa transação, e um banco mais novo que o código é recusado.
- Backup é copiar o `.sqlite`; o `.env` não vai no mesmo backup, porque é a outra
  metade da chave do [cofre](/features/cofre-de-segredos.md).
- O porquê de ser só web, e o que foi descartado: [Arquitetura](/conventions/architecture.md),
  ADR 0012.

# Onde mora

- `Makefile` (`start`, `dev`, `dev-all`, `clean-db`, `clean-db-app`, `check`), `.env.example`
- `server/src/shell/` (`app.ts` com a guarda e o `/health`, `config.ts`, `database.ts`,
  `migrations.ts`), `server/src/index.ts`, `server/src/dev.ts`
- `ui/vite.config.ts` (o proxy)

# Entregue

A API local e as migrations em 2026-09-16, em commits diretos; só web, a guarda de Host
e Origin e o `make start` no #10, em 2026-10-28.

# Limites

- Outra aplicação web em `localhost` passa pela regra de Origin, porque as portas não
  foram fixadas.
- O servidor ainda aceita um token que nada no app gera (`TODO.md`).
- Sem backup automático em nuvem: é pós-MVP.
