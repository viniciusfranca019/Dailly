# dailly

Um diário pessoal para desktop, escrito sobre um editor de blocos no estilo do
Notion, com um cliente de API ao lado. TypeScript de ponta a ponta: Vue no
renderer, Fastify + SQLite na API local, Electron como casca.

## Setup

Requisitos: **Node** (desenvolvido no 24; não há `engines` fixado) e **pnpm 11.9**,
o `packageManager` do `package.json` — `corepack enable` resolve.

```bash
make install     # instala as dependências do workspace inteiro
make dev         # API em :4317 + app em http://localhost:5173 (playground em /playground/)
```

Não há `.env`: a configuração é por variável de ambiente, toda opcional.

| Variável | Para quê | Padrão |
|---|---|---|
| `DAILLY_TZ` | fuso IANA em que os dias são contados | `UTC` |
| `DAILLY_PORT` | porta da API em dev | `4317` |
| `DAILLY_DB` | arquivo SQLite da API em dev | `server/dailly.dev.sqlite` |
| `VITE_REQUESTS` · `VITE_ANALYSE` | ligam os módulos por flag de build | desligados |

## Comandos

`make help` lista todos. Os principais:

| Comando | Faz |
|---|---|
| `make dev` | API + app, só os módulos prontos |
| `make dev-all` | idem, com todos os módulos ligados por flag |
| `make dev-api` · `make dev-ui` | só a API · só o renderer (sem a API, a timeline não carrega) |
| `make desktop` | builda e abre o app completo no Electron, com a API dentro e o banco de verdade |
| `make desktop-dev` | Electron apontado para o vite (rode `make dev` em outro terminal) |
| `make test` · `make test-all` | testes do workspace · com as flags ligadas |
| `make test-watch` | testes em watch |
| `make check` | typecheck + testes, com e sem as flags |
| `make build` · `make build-all` | builda o renderer, só os módulos prontos · com todos |

Os dados vivem em dois lugares, e os comandos que os apagam são separados de
propósito:

| Comando | Apaga |
|---|---|
| `make clean-db` | o banco de desenvolvimento (`server/dailly.dev.sqlite`) |
| `make clean-db-app` | o diário de verdade (`~/.config/dailly`) — pede confirmação |
| `make clean` | build e dependências; **não toca em banco nenhum** |

## Módulos

O que a pessoa usa. Cada módulo existe na `ui/` e, quando persiste, no
`server/`, entrando por um manifest em cada lado.

| Módulo | O que faz | Estado |
|---|---|---|
| **Daily Log** | entradas em markdown sobre o dia, editadas no whiteboard, numa timeline agrupada por dia no fuso configurado | Fase 1 concluída; labels, propriedades e filtros são a Fase 2 |
| **Requests** | cola um `curl`, edita, executa pelo servidor e mostra a resposta; coleção em pastas | entregue, atrás de `VITE_REQUESTS` |
| **Analyse** | resumo de período com IA, chave do próprio usuário | placeholder, Fases 4–5, atrás de `VITE_ANALYSE` |

## Projetos e pacotes

| Diretório | O que é | README |
|---|---|---|
| `packages/` | os modelos que renderer e servidor compartilham: `whiteboard-core`, `domain`, `periods`, `requests-core` | [`packages/README.md`](packages/README.md) |
| `server/` | a API local: shell, módulos `entries` e `requests`, SQLite com migrations | [`server/src/README.md`](server/src/README.md) |
| `ui/` | o renderer: shell Vue, módulos de produto, o whiteboard como capacidade | [`ui/src/README.md`](ui/src/README.md) |
| `desktop/` | o processo main do Electron: janela, `createServer()`, token por execução | — |
| `e2e/` | as duas metades da port de entries, uma contra a outra | — |

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — como o sistema se comporta,
  módulo por módulo, e onde cada pedaço mora. **Comece por aqui.**
- [`docs/README.md`](docs/README.md) — o índice: MVP em BDD, roadmap, ADRs,
  auditoria de lacunas.
- [`TODO.md`](TODO.md) — o que foi decidido e ainda não foi feito, com o
  gatilho de cada um.

## Licença

Copyright 2026 Vinicius França (@viniciusfranca019)

Apache License 2.0 — o texto completo está em [`LICENSE`](LICENSE).
