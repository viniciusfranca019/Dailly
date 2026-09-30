# server

A API local do dailly (`@dailly/server`): Fastify sobre SQLite, ouvindo só em
`127.0.0.1`. No app, roda dentro do processo main do Electron; em dev, sozinha
na porta 4317, atrás do proxy do vite.

## Briefing

| Parte | O que é |
|---|---|
| `shell/` | o que não é de módulo nenhum: config, banco, runner de migrations, token, `/health` |
| `modules/entries` | o Daily Log: `GET` e `POST /entries`, a tabela `entries` |
| `modules/requests` | o cliente de API: a coleção e `POST /requests/:id/execute` |
| `adapters/` | `SqliteEntryRepository`, que implementa a port de `@dailly/domain` |
| `index.ts` | `createServer()`, o composition root — a única função de que o Electron precisa |

## Setup e comandos

Da raiz do repositório:

```bash
make dev-api                              # só a API, em http://127.0.0.1:4317, com reload
pnpm --filter @dailly/server test
pnpm --filter @dailly/server typecheck
make clean-db                             # apaga o banco de dev (pare a API antes)
```

| Variável | Para quê | Padrão |
|---|---|---|
| `DAILLY_TZ` | fuso IANA dos dias; inválido derruba o boot com mensagem | `UTC` |
| `DAILLY_PORT` | porta em dev | `4317` |
| `DAILLY_DB` | arquivo SQLite em dev | `dailly.dev.sqlite` (em `server/`) |

Sem token em dev. No app, o token é gerado a cada execução pelo `desktop/`.

## Mais

- [`docs/architecture.md`](docs/architecture.md) — shell, contrato de módulo,
  migrations, rotas e o mapa de status de cada falha.
- [`../../docs/architecture.md`](../../docs/architecture.md) — o comportamento
  de cada módulo, de ponta a ponta.
