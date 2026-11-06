---
type: Convention
title: Módulos
description: Como um módulo de produto novo entra no dailly, na ui/, no server/ e em packages/, e o que os testes de arquitetura cobram dele.
tags: [arquitetura, modulos, ui, server]
status: stable
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:10:00-03:00 }
---

# Regra

Um módulo de produto é uma coisa que a pessoa usa (Daily Log, Requests,
Analyse). Ele existe nos dois lados que precisa, e entra em cada um **só pelo
manifest**: nenhum shell importa um módulo pelo nome. Tirar um módulo é apagar
uma linha do manifest; o shell não muda. O porquê está em
[Arquitetura](/conventions/architecture.md), nas decisões de modularização (era
a ADR 0006) e do Requests (era a ADR 0011).

**Módulo ou capacidade.** O que não tem port nem conhece o produto é
capacidade, não módulo: o whiteboard (`ui/src/capabilities/whiteboard` +
`@dailly/whiteboard-core`) recebe e devolve markdown e não sabe o que é uma
`Entry`. Uma capacidade é usada por módulos e nunca importa um.

# Onde cada metade mora

| Metade | Onde | Quando existe |
|--------|------|---------------|
| Modelo puro | `packages/<nome>-core` (ou `packages/<nome>`) | quando a `ui/` e o `server/` precisam entender a mesma coisa: validar, montar, resolver |
| Tela | `ui/src/modules/<id>/` | sempre |
| API e dados | `server/src/modules/<id>/` | quando o módulo persiste ou executa algo |

Só o que é puro vai para `packages/`: sem builtin do Node, sem DOM, sem rede.
O que executa (rede, disco, cifra) fica no `server/`. Foi esse corte que deixou o
Requests aceitar gRPC e AMQP sem reescrever o modelo.

# Passo a passo

## 1. O modelo, em `packages/` (se houver)

- Um pacote `@dailly/<nome>` com `src/index.ts` como única entrada pública.
- **A port nasce no lado de quem a consome**, com a suíte de contrato junto
  (`src/testing/`): `EntryRepository` e `entry-repository-contract.ts` no
  `@dailly/domain`, `RequestStore` no `@dailly/requests-core`. Toda
  implementação, a de memória e a SQLite, roda contra a mesma suíte.
- Um `architecture.test.ts` no pacote quando ele tem uma regra própria (o
  `requests-core` proíbe o modelo de nomear protocolo e a metade pura de
  executar).
- O pacote entra no `vitest.config.ts` da raiz pelo `vitest.config.ts` dele.

## 2. A tela, em `ui/src/modules/<id>/`

```
ui/src/modules/<id>/
  index.ts     export { default as component } from './ui/<Id>.vue'; export type { <Id>Deps }
  deps.ts      o que é só deste módulo: ports e geradores (RequestsDeps)
  model/       TypeScript puro: estado e regra da tela, sem Vue
  ui/          um .vue por pedaço da tela (editor/, response/, collection/…)
```

- **O módulo é um componente** (`VueModule`, `ui/src/shared/vue-module.ts`),
  exportado com nome a partir de um `index.ts`. O `.ts` é o que deixa o index
  visível para as regras do `ui/src/architecture.test.ts`.
- **A entrada no manifest** (`ui/src/shell/modules.ts`): `id`, `title`, `route`
  e um `load: () => import('@modules/<id>')`. Um módulo que ainda não está pronto
  entra atrás de uma flag de build, escrita como comparação literal
  (`import.meta.env.VITE_<ID> === 'true'`) com o descritor inteiro dentro do
  ramo, porque só assim o Vite dobra o ramo e o chunk some do bundle. A flag vai
  no `ui/src/env.d.ts` e nos alvos `dev-all`, `test-all` e `build-all` do
  `Makefile`.
- **Um atalho de qualquer tela é um comando** (card #47): o descritor ganha
  `commands: [{ id, shortcut: { key, mod? } }]`, dentro do ramo da flag, e o index do
  módulo exporta `commands = { <id>: <Componente> }`. O shell escuta o `keydown` em
  `window`, aplica a RN15 (`shared/command.ts`: sem `mod`, não dispara num campo),
  carrega o módulo pelo mesmo `load()` e mostra o componente numa camada, com as
  props `deps`, `focusTick`, `navigate(route)` e `close()`. Um pedido para o próprio
  módulo (abrir a tarefa escolhida) vai por um estado em `model/` dele, nunca pelo
  shell. Os atalhos de uma tela só (o Ctrl+S do painel) ficam nela.
- **As dependências** chegam em duas metades: o comum a todos (`SharedDeps`,
  `ui/src/shared/deps.ts`: o fuso e o relógio) e o que é só do módulo, que ele
  declara no próprio `deps.ts`. O id do módulo ganha uma chave em `OwnDeps`
  (`ui/src/shell/own-deps.ts`) e a raiz (`ui/src/shell/main.ts`) monta essa
  metade. Esquecer o módulo ali é erro de compilação. Um módulo sem dependência
  própria (o Analyse) não entra em `OwnDeps`.
- **Use-cases, nunca repositório**: o módulo recebe funções do domínio
  (`createEntry`, `queryEntries`) ou uma port (`RequestsPort`), e não sabe se do
  outro lado há SQLite ou um fake.
- A port que a tela consome mora em `ui/src/shared/` (`requests.ts`,
  `vault.ts`) e o adapter HTTP dela em `ui/src/adapters/`. Nenhum módulo importa
  um adapter: ele chega pela raiz.

## 3. A API, em `server/src/modules/<id>/`

```
server/src/modules/<id>/
  index.ts        export const <id>Module: ServerModule<TOwn> = { id, migrations, provide?, register }
  migrations.ts   a fatia deste módulo no schema
  routes.ts       as rotas Fastify
```

- **O contrato** é `ServerModule<TOwn>` (`server/src/shell/module.ts`). A única
  seta legítima de um módulo para o shell é esse arquivo.
- **A entrada no manifest** (`server/src/modules.ts`) passa por
  `defineModule(<id>Module)`, nunca por anotação direta como `AnyServerModule`:
  é o `defineModule` que faz o compilador cobrar um `provide` de quem declara
  `TOwn`. Do lado do servidor não há flag de build; a rota de um módulo
  desligado na tela fica só sem quem a chame.
- **Dependência própria vai no `provide`**, construída pelo módulo a partir do
  `ProvideContext` (`db`, `zone`, `vault`), e não como campo novo em
  `ServerModuleDeps`, que hoje só carrega a zona. Cada campo novo ali faria
  todos os módulos verem uma dependência que só um usa. Não há exceção: o
  entries também constrói o repositório dele no `provide` (card #29).
- **Migrations numa sequência global** de `PRAGMA user_version`: o módulo
  escolhe os números das suas fatias, e o `collectMigrations` recusa colisão no
  boot nomeando os dois módulos. Hoje entries é `1` e `4`, requests é `2`, o cofre é
  `3` e o tasks é `5`, `8`, `9` e `10`; o módulo novo pega o próximo livre. Uma migration já entregue nunca muda:
  uma correção é uma migration nova.
- **Os testes de rota moram na raiz de `server/src`** (`requests.test.ts`,
  `cofre.test.ts`), não dentro de `modules/`: a regra de arquitetura recusa teste
  de integração dentro de um módulo, porque ele monta o app inteiro. Um teste
  que monta só as rotas do módulo num Fastify próprio, sobre um store de
  teste, mora dentro dele (`modules/entries/routes.test.ts`).

# O que os testes cobram

Os `architecture.test.ts` falham nomeando o arquivo culpado. Um módulo novo
está pronto quando passa por todos eles sem mexer em nenhum:

| Onde | O que prende |
|------|--------------|
| `architecture.test.ts` (raiz) | `packages/` não importa `ui/` nem `server/`, e os dois não se importam |
| `ui/src/architecture.test.ts` | capacidade não importa módulo; um módulo só alcança outro pelo index; ninguém importa o shell; nenhum módulo alcança os adapters |
| `server/src/architecture.test.ts` | fora de `modules/`, só o manifest importa um módulo; um módulo alcança o contrato e o index de outro, e mais nada |
| `packages/*/src/architecture.test.ts` | o domínio roda em qualquer lugar; o core do whiteboard não toca DOM; o modelo do Requests não nomeia protocolo nem executa |

E o `make check` roda typecheck e testes com e sem as flags, porque com as
flags desligadas o loop da `ui/src/shell/composition.test.ts` não monta o
módulo novo.

# Pronto quando

- O manifest de cada lado tem a linha, e nada além dele nomeia o módulo.
- A port tem a suíte de contrato, e a implementação real passa nela.
- `make check` verde.
- A página da feature em [Features](/features/index.md) existe, e o
  `VERSION` sobe ([Versão](/conventions/versioning.md): uma feature nova é PATCH
  enquanto o dailly é `0.x`).
