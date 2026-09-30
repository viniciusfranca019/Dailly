# Arquitetura — `server/`

O servidor é a API local do app: Fastify sobre SQLite, ouvindo só em
`127.0.0.1`. Ele guarda o que o renderer manda e executa o que o renderer não
consegue executar. Os use-cases do Daily Log **não** rodam aqui — rodam no
renderer, e o servidor é o outro lado da port
([`packages/docs/architecture.md`](../../../packages/docs/architecture.md#daillydomain)).

Ele espelha as duas camadas da `ui/`: um **shell** que não conhece módulo
nenhum pelo nome, e **módulos** que entram por um manifest
([ADR 0006, Emenda 2](../../../docs/adrs/0006-modularizacao-frontend.md)).

## Estrutura

```
server/src/
  index.ts              composition root: createServer() — config, manifest, banco, rotas, socket
  dev.ts                entrada de desenvolvimento: porta fixa 4317 para o proxy do vite
  modules.ts            o manifest — o único lugar que sabe quais módulos existem
  shell/                o que não é de módulo nenhum
    config.ts           resolveConfig: arquivo do banco, fuso (DAILLY_TZ), token, host, porta
    database.ts         openDatabase: WAL, foreign_keys e migrations
    migrations.ts       collectMigrations · migrate · DatabaseTooNewError
    module.ts           o contrato de módulo: ServerModule · defineModule · assertManifest
    app.ts              buildApp: token, /health e o laço que registra os módulos
  modules/
    entries/            Daily Log: routes · validate · migrations · index
    requests/           Requests: routes · validate · migrations · execute · sqlite-request-store · index
  adapters/
    sqlite-entry-repository.ts   EntryRepository sobre SQLite
  __fixtures__/v1.sqlite         um banco real da versão 1, versionado de propósito
```

## Quem chama o servidor

| Chamador | Como | Porta | Token |
|---|---|---|---|
| `desktop/src/main.ts` | `createServer()` dentro do processo main do Electron | `0` (o SO escolhe) | gerado por execução, entregue ao renderer por IPC |
| `dev.ts` (`make dev-api`) | processo próprio via `tsx watch` | `4317` (`DAILLY_PORT`) | nenhum |
| testes | `buildApp()` + `app.inject()`, sem socket | — | quando o teste é sobre auth |

`createServer` é a única função de que o Electron precisa, e ela roda sem
Electron — o `boots-without-electron.test.ts` prova isso a cada `make check`.

## O shell

**A ordem do boot não é arbitrária** (`index.ts`): o manifest é validado e as
migrations são coletadas *antes* de o arquivo ser aberto. Um manifest
inconsistente derruba o boot sem ter escrito nada.

```
resolveConfig ─► assertManifest ─► collectMigrations ─► openDatabase(migrate)
             ─► sqliteEntryRepository ─► buildApp(módulos) ─► listen
```

- **Config** (`config.ts`): fuso inválido falha no boot com mensagem, não num
  500 depois. Host padrão é loopback — `0.0.0.0` poria o diário na rede local.
- **Token** (`app.ts`): quando presente, toda rota exige
  `Authorization: Bearer <token>`. `/health` é isento **pela rota registrada**,
  não pelo prefixo da URL, para que `/healthz` de um módulo não vire bypass.
- **`/health`** responde `{ status, zone }`. O renderer lê o fuso daqui, porque
  o fuso é variável *deste processo* ([ADR 0007](../../../docs/adrs/0007-api-local-e-tempo.md)).
- **Banco** (`database.ts`): WAL para leitor e escritor coexistirem;
  `foreign_keys = ON` porque o SQLite vem com ele desligado e o schema depende
  de `ON DELETE CASCADE`.

### Migrations: uma sequência global

`PRAGMA user_version` é **um inteiro por arquivo**, então não existe "versão do
módulo". Cada módulo declara sua fatia, o shell concatena e ordena, e
`collectMigrations` recusa colisão nomeando a versão e os dois módulos.

| Versão | Módulo | O que cria |
|---|---|---|
| 1 | entries | `entries` + índice em `occurred_at` |
| 2 | requests | `request_folders`, `requests` + índices |

Cada migration roda numa transação junto com o bump do `user_version`. Um banco
**mais novo** que o schema montado é recusado (`DatabaseTooNewError`): abrir
arriscaria corromper dados de uma versão futura — é a metade barata da
história de backup da [ADR 0005](../../../docs/adrs/0005-backup-restore.md).

## O contrato de módulo

```ts
ServerModule<TOwn> = {
  id, migrations,
  provide?(ctx: { db, zone }): TOwn        // a dependência que é só deste módulo
  register(app, deps: { entries, zone }, own: TOwn): void
}
```

- **`provide`** existe para que um módulo novo não faça o saco comum
  (`ServerModuleDeps`) crescer um campo. O Requests constrói o próprio
  `RequestStore` por aqui.
- O **entries fica fora do `provide` de propósito**: o repositório dele é
  construído no composition root, porque o teste do 501 injeta um diferente a
  cada `buildApp`.
- **`defineModule`** é a única porta para o manifest. `ServerModule<T>` é o tipo
  de *autoria* (amarra "declara `TOwn`" a "tem `provide`"); `AnyServerModule` é
  o tipo de *armazenamento*, alargado, e só `defineModule` produz a marca que
  ele exige.

Sem flag de build, ao contrário da `ui/`: aqui não há bundle, e uma rota
desligada não custa nada a ninguém.

## Os módulos

### `entries` — o Daily Log

| Rota | Faz | Recusas |
|---|---|---|
| `GET /entries?from&to` | lista, mais novo primeiro; `from`/`to` são dias `YYYY-MM-DD` | 400 período inválido · 501 filtro da Fase 2 |
| `POST /entries` | grava uma `Entry` **já pronta** | 400 nomeando o campo |

O `SqliteEntryRepository` (`adapters/`) não normaliza nem carimba nada: o
corpo chega normalizado e o id chega gerado, porque `createEntry` rodou no
renderer. O que ele faz é traduzir o filtro de dias em limites de instante com
`rangeBounds` do `@dailly/periods`, no fuso do processo.

Ele mora em `adapters/` e não em `modules/entries/` porque implementa uma port
do **pacote** `@dailly/domain`, não do módulo — o mesmo critério que põe o
`http-entry-repository.ts` em `ui/src/adapters/`.

### `requests` — o cliente de API

| Rota | Faz |
|---|---|
| `GET /requests` · `GET /requests/folders` | lista a coleção |
| `POST /requests` · `DELETE /requests/:id` | grava (upsert) / apaga uma request |
| `POST /requests/folders` · `PATCH /requests/folders/:id` | cria / move uma pasta |
| `POST /requests/:id/execute` | executa **o que está guardado**, com o `env` do corpo |

A execução, em ordem: lê a request guardada → valida o `env` (todo valor tem
que ser texto) → `resolve()` do `@dailly/requests-core` monta a requisição
literal → `execute.ts` a envia com `undici`.

Cada falha tem o seu status, porque cada uma manda a pessoa olhar para um lugar
diferente:

| Status | Significa |
|---|---|
| 400 | `env` malformado, ou variável sem valor (`missing` / `surviving` no corpo) |
| 404 | request ou pasta que não existe |
| 409 | mover a pasta fecharia um laço |
| 422 | spec inválido, protocolo desconhecido, spec guardado que não é JSON |
| 502 | o alvo não atendeu |
| 504 | o alvo atendeu e não terminou em 30 s |

O que volta é status, headers, corpo, duração e três marcas: `encoding`
(`base64` quando o corpo não é texto ou veio comprimido), `truncated` (acima de
5 MB) e `timedOut` (o prazo estourou no meio do corpo, e o parcial vem junto).
**O servidor não descomprime**: entrega os bytes marcados, e quem mostra decide.

O `sqliteRequestStore` mora *dentro* do módulo — diferente do adapter de
entries — porque só este módulo o constrói, via `provide`. Um spec guardado que
não parseia aparece na listagem com `spec: null` para poder ser apagado, em vez
de derrubar a coleção inteira.

## A fronteira é testada

`src/architecture.test.ts` varre o source e falha nomeando o arquivo culpado:

- fora de `modules/`, só o manifest (`modules.ts`) importa um módulo — o shell
  nunca;
- um módulo alcança outro só pelo `index.ts` público;
- o que um módulo alcança fora de si é **lista branca**: o próprio interior, o
  contrato `shell/module.ts` e o index de outro módulo. Pacotes (`fastify`,
  `@dailly/*`) são livres;
- o interior não entra pelo próprio ponto de entrada (`../index.js` ou
  `@dailly/server`), que reexporta o shell inteiro.

As outras suítes do projeto:

| Arquivo | Prova |
|---|---|
| `app.test.ts` | a superfície HTTP do entries, as recusas e o token |
| `composition.test.ts` | módulo entra pelo manifest, sua migration é a que roda, `/health` isento pela rota, `provide` |
| `requests.test.ts` | a execução ponta a ponta contra um alvo local, e as pastas pela API |
| `existing-database.test.ts` | o `v1.sqlite` sobe de versão sem reaplicar o que já rodou |
| `boots-without-electron.test.ts` | `createServer` com socket de verdade, sem Electron |
| `adapters/*.test.ts` · `modules/requests/*.test.ts` | os stores SQLite contra o contract test do pacote |
