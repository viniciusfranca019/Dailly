# Arquitetura — visão geral

O dailly é um app desktop pessoal: um diário (Daily Log) sobre um editor de
blocos estilo Notion, mais um cliente de API (Requests), com a análise de
período (Analyse) por vir. Este documento descreve **como o sistema se comporta,
módulo por módulo**, e onde cada pedaço mora. O detalhe de cada projeto está no
documento dele:

| Projeto | O que é | Arquitetura |
|---|---|---|
| `packages/` | os modelos que os dois runtimes compartilham | [`packages/docs/architecture.md`](../packages/docs/architecture.md) |
| `server/` | a API local: Fastify + SQLite | [`server/src/docs/architecture.md`](../server/src/docs/architecture.md) |
| `ui/` | o renderer: Vue + o whiteboard vanilla | [`ui/src/docs/architecture.md`](../ui/src/docs/architecture.md) |
| `desktop/` | o processo main do Electron | descrito abaixo |

As decisões por trás de tudo estão nas [ADRs](adrs/); o que foi decidido e
ainda não foi feito, em [`../TODO.md`](../TODO.md); a ordem das fases, em
[`roadmap.md`](roadmap.md).

## Os processos

```
┌──────────────── Electron (desktop/) ─────────────────┐
│  main process (Node)                                  │
│    createServer({ port: 0, token }) ──► Fastify       │
│         │                                  │          │
│         │ ipc 'dailly:api-config'          ▼          │
│  preload.cjs ── contextBridge         SQLite          │
│         │                        ~/.config/dailly/    │
│  renderer (ui/dist) ─── HTTP 127.0.0.1:<porta> ──┘    │
└───────────────────────────────────────────────────────┘
```

- **Um processo Node, dois papéis.** O main do Electron *é* Node, então o
  servidor entra como import — sem sidecar nem segundo binário
  ([ADR 0008](adrs/0008-electron-como-shell.md)).
- **A fronteira entre UI e dados é HTTP**, mesmo no mesmo processo
  ([ADR 0007](adrs/0007-api-local-e-tempo.md)). É o que deixa o servidor subir
  sem Electron num teste, e o renderer rodar no browser em dev.
- **Porta efêmera e token por execução**, porque `127.0.0.1` é alcançável por
  qualquer processo da máquina. O renderer pede os dois por IPC; nunca estão em
  `argv` nem em URL.
- **Janela endurecida:** `contextIsolation`, `sandbox`, sem `nodeIntegration`,
  e navegação para fora abre no browser do sistema.
- **Em dev** são dois processos: `make dev` sobe a API na porta 4317 e o vite
  em 5173, com proxy `/api` → API.

## Os módulos

Cada módulo de produto existe **nos dois lados**, entrando por um manifest em
cada um: `ui/src/shell/modules.ts` (com flag de build) e
`server/src/modules.ts` (sem flag). Nenhum shell importa módulo pelo nome.

| Módulo | Na `ui/` | No `server/` | Modelo em `packages/` | Estado |
|---|---|---|---|---|
| Daily Log | `modules/daily-log` (sempre ligado) | `modules/entries` | `domain` · `whiteboard-core` · `periods` | Fase 1 concluída |
| Requests | `modules/requests` (`VITE_REQUESTS`) | `modules/requests` | `requests-core` | entregue |
| Analyse | `modules/analyse` (`VITE_ANALYSE`) | — | — | placeholder, Fases 4–5 |

### Daily Log — escrever sobre o dia

Registro de pensamentos e acontecimentos, cada um uma `Entry` cujo **corpo é
markdown** editado no whiteboard. Labels e propriedades ficam ao lado do corpo,
nunca dentro dele ([`adaptacao-dailly.md`](adaptacao-dailly.md)).

**Criar uma entrada:**

```
Composer.vue ── doc.toMarkdown() ──► body
DailyLog.vue ── occurredAtFor(dia) ──► agora (hoje) | meio-dia (dia anterior)   política da tela
                                     createEntry            (renderer, @dailly/domain)
                                       ├─ serialize(parse(body))  normaliza uma vez
                                       ├─ corpo vazio? → EmptyBodyError
                                       ├─ id = uuid, createdAt = updatedAt = agora
                                       └─ occurredAt = o que a tela mandou, senão agora
                                     HttpEntryRepository.create
                                       POST /entries ──► validateEntry ──► SqliteEntryRepository
                                                          (400 nomeando o campo)
```

**Ler a timeline:**

```
DailyLog.vue ── queryEntries ──► GET /entries?from&to ──► rangeBounds(dia, fuso) ──► SQL
          ◄── Entry[] (mais nova primeiro) ── groupByDay(entries, fuso) ── Timeline.vue
```

Três regras que atravessam o fluxo:

- **Os use-cases rodam no renderer.** O servidor guarda uma `Entry` pronta; não
  recarimba, não renormaliza, não gera id.
- **Normalizar na criação** faz "abrir e salvar sem editar" ser no-op, sem
  `updatedAt` fantasma.
- **Um fuso, uma conversão.** O fuso é do processo da API (`DAILLY_TZ`, padrão
  UTC), a tela o lê de `/health` e o mostra sempre, e todo "que dia é este
  instante" passa por `@dailly/periods`.

Labels, propriedades, edição, exclusão e filtros são a Fase 2
([`mvp.md`](mvp.md), [`roadmap.md`](roadmap.md)); as rotas que dependem deles
respondem 501 até lá.

### Requests — colar um curl e executar

Um cliente de API estilo Postman/Insomnia. Hoje só HTTP; a estrutura aceita
gRPC e AMQP sem reescrever o modelo
([ADR 0011](adrs/0011-requests-modulo-e-execucao.md)).

**O que decide a forma inteira é onde a requisição executa: no servidor.** Um
renderer não manda `Host`, `Origin` nem `Cookie`; de `file://` o CORS devolve
resposta opaca; e gRPC não existe num webview. Daí o corte: a metade **pura**
(entender, validar, montar) roda nos dois lados; a metade que **executa** só no
servidor.

```
barra de URL ── curl ──► importCurl (fromRaw)        renderer, @dailly/requests-core/http
                           └─ flags ignoradas são relatadas, não caladas
               draft ──► POST /requests               grava (upsert) na coleção
Enviar ──────────────► POST /requests/:id/execute { env }
                           ├─ resolve(spec, env)      variável sem valor → 400, nada sai
                           ├─ validate                spec inválido → 422
                           └─ undici                  502 inalcançável · 504 prazo de 30 s
               ◄── status · headers · corpo · duração · marcas (encoding, truncated, timedOut)
ResponseView ── decodeBody: gzip/deflate abrem; br é dito, nunca vira U+FFFD
```

- **Executar grava antes de rodar**, porque a rota executa o que está guardado:
  o que está na tela é sempre o que sai.
- **Variável sem valor recusa** a requisição nomeando todas as que faltam, em
  vez de mandar `Bearer {{token}}` para a rede.
- **A coleção é uma árvore** de pastas (`parentId` + `position`), e nenhuma
  escrita pode fechar laço (409).

### Analyse — o resumo do período (por vir)

Resumir as entradas de um período (dia, semana, mês, quadrimestre) com o
provider de IA escolhido pelo usuário, com chave própria
([ADR 0004](adrs/0004-ai-providers-byok.md)). Depende do Daily Log completo
(Fase 2) e de Settings/BYOK (Fase 3). Hoje é só o placeholder que mantém a flag
honesta.

## O que é comum a todos os módulos

### Capacidade não é módulo

O whiteboard (`ui/src/capabilities/whiteboard` + `@dailly/whiteboard-core`) é
usado pelo Daily Log mas **não conhece `Entry`**: markdown entra, markdown sai.
O que não tem ports nem conhecimento do produto vira capacidade; o resto é
módulo.

### Ports com contract test

Cada port nasce no lado de quem a consome — `EntryRepository` no
`@dailly/domain`, `RequestStore` no `@dailly/requests-core`, `RequestsPort` em
`ui/src/shared` — e vem com a suíte que toda implementação tem que passar. A
implementação em memória e a SQLite rodam contra a mesma suíte.

### Dados

Um arquivo SQLite por instalação (`~/.config/dailly/dailly.sqlite` no app,
`server/dailly.dev.sqlite` em dev). O schema é versionado por
`PRAGMA user_version` numa **sequência global**: cada módulo declara sua fatia,
o shell do servidor junta e recusa colisão, e um banco mais novo que o schema
conhecido é recusado ([ADR 0002](adrs/0002-data-layer.md),
[ADR 0005](adrs/0005-backup-restore.md)). Backup é copiar o arquivo.

### A fronteira é testada, não combinada

Seis `architecture.test.ts` varrem o source e falham nomeando o arquivo
culpado, cada um onde a regra é verificável:

| Onde | O que prende |
|---|---|
| `architecture.test.ts` (raiz) | as setas **entre** projetos: `packages/` não importa `ui/` nem `server/`, os dois não se importam, e ninguém importa `desktop/` |
| `ui/src/` | as camadas da `ui/`: capability não importa módulo, módulo só pelo index público, ninguém importa o shell |
| `server/src/` | o shell só conhece o manifest; módulo só alcança o contrato e o index de outro |
| `packages/domain/src/` | o domain roda em qualquer lugar: sem builtin do node, sem DOM, sem vitest na produção |
| `packages/whiteboard-core/src/` | nada de DOM no core |
| `packages/requests-core/src/` | o modelo não nomeia protocolo nenhum, e a metade pura não executa |

E um teste que só pode morar fora de todos os projetos:
`e2e/entries-round-trip.test.ts` põe as duas metades da port de entries uma
contra a outra, de verdade — um campo renomeado deixaria as duas suítes verdes
e o app quebrado.
