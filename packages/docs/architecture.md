# Arquitetura — `packages/`

Os quatro pacotes são o código que **dois runtimes precisam ao mesmo tempo**: o
renderer (`ui/`) e o servidor (`server/`). Por isso nenhum deles conhece DOM,
Fastify, SQLite ou rede — e por isso eles moram fora dos dois projetos
([ADR 0007](../../docs/adrs/0007-api-local-e-tempo.md),
[ADR 0009](../../docs/adrs/0009-topologia-do-workspace.md)).

O critério de entrada é esse, e não "é reutilizável": um modelo que só um lado
usa mora naquele lado.

## Os pacotes e quem os usa

| Pacote | O que é | `ui/` usa para | `server/` usa para |
|---|---|---|---|
| `@dailly/whiteboard-core` | markdown → árvore de blocos → markdown | editar (o adapter DOM renderiza o modelo) | — (entra via `domain`) |
| `@dailly/domain` | `Entry`, a port `EntryRepository`, os use-cases do Daily Log | rodar `createEntry` / `queryEntries` | tipar e implementar a port em SQLite |
| `@dailly/periods` | instante + fuso → dia do calendário, e volta | agrupar a timeline por dia, rotular a hora | converter o filtro `from`/`to` em limites de instante |
| `@dailly/requests-core` | curl → `ProtocolSpec` → o que sai na fita | importar curl, mostrar o preview | validar e resolver antes de executar |

As setas entre eles:

```
@dailly/domain ──► @dailly/whiteboard-core     (createEntry normaliza o corpo)
@dailly/periods                                 (sem dependências, só Intl)
@dailly/requests-core                           (sem dependências)
```

`packages/` nunca importa de `ui/` nem de `server/`. Quem garante é o
`architecture.test.ts` da raiz do repositório.

## Convenções comuns aos quatro

- **Sem build.** `main`/`types`/`exports` apontam direto para `src/*.ts`; quem
  consome compila.
- **Sem lib DOM no `tsconfig`**, então o compilador recusa `document` e
  `window`. O que o tipo não vê (um `fetch` global, um `node:` builtin) é
  pego pelo `architecture.test.ts` de cada pacote.
- **Superfície por subpath.** O que não é produção sai por um `exports` próprio:
  `@dailly/domain/testing`, `@dailly/requests-core/testing`,
  `@dailly/requests-core/http`. O índice principal nunca carrega `vitest`.
- **Contract tests.** Toda port vem com a suíte que qualquer implementação tem
  que passar (`entryRepositoryContract`, `requestStoreContract`). A
  implementação em memória roda contra ela aqui; a SQLite roda contra a mesma
  suíte no `server/`.
- **Erro com nome.** Toda recusa é uma classe (`EmptyBodyError`,
  `FolderCycleError`, …), para que quem chama decida por tipo e não por texto.

---

## `@dailly/whiteboard-core`

O modelo do editor estilo Notion. Markdown entra, uma árvore imutável de blocos
sai, e markdown volta. **Round-trip é requisito**: `serialize(parse(md)) === md`
para qualquer fonte normalizada, e é testado. Clicar num checkbox tem que
produzir `[x]` no markdown, senão a interatividade é só cosmética:

```
markdown ──parse──► Block[] ──render (ui/)──► DOM
                      ▲                        │
                      └──────── clique ────────┘
                                  │
                              serialize
                                  ▼
                              markdown
```

```
whiteboard-core/src/
  index.ts            superfície pública
  blocks.ts           o modelo: união discriminada de blocos + helpers imutáveis (walk, mapBlock, findBlock)
  registry.ts         BlockRegistry: o ponto de extensão (match / parse / serialize por sintaxe)
  blocks/             uma definição por sintaxe: heading · todo · list · paragraph
  parser/
    lines.ts          fase 1: texto → linhas com indentação medida
    index.ts          fase 2: linhas → árvore (só este arquivo entende aninhamento)
  serialize.ts        árvore → markdown normalizado
  tree.ts             operações estruturais da edição (locate / insert / remove)
  document.ts         WhiteboardDocument: estado + comandos de edição + subscribe
```

**Quem usa:** `ui/src/capabilities/whiteboard/` (o adapter DOM que desenha e
edita) e `@dailly/domain` (`createEntry` passa o corpo por `parse` +
`serialize` para gravar já no ponto fixo).

**O seam com o produto é markdown.** O Daily Log guarda `doc.toMarkdown()` no
corpo da entrada e restaura com `doc.setMarkdown()`. O whiteboard não sabe que
isso acontece.

### Sintaxe suportada

| Sintaxe | Bloco | Observação |
|---|---|---|
| `# t` … `#### t` | Heading h1–h4 | `#####` ou mais vira parágrafo, não é clampado |
| `[] t` / `[ ] t` / `[x] t` | Checkbox | forma Notion (sem bullet) |
| `- [ ] t` / `1. [x] t` | Checkbox | forma GFM, normalizada para `[] ` (num item numerado, vira checkbox e interrompe a numeração) |
| `- t` / `* t` / `+ t` | Lista com bullet | normalizado para `- ` |
| `1. t` / `1) t` | Lista ordenada | renumerada a partir de 1 |
| qualquer outra linha | Parágrafo | fallback |

Aninhamento é por **indentação** (tab = 4 espaços na leitura, 2 na escrita).
Qualquer linha indentada mais que a anterior vira filha dela.

### Decisões do modelo

- **Toggle não tem marcador.** Qualquer bloco com filhos colapsa, e é só isso
  que `isCollapsible` verifica. Um `##` com filhos é a toggle section; um `-`
  com filhos é a toggle list. O `>` ficou livre: blockquote é um `register()`
  de distância.
- **Sem container de lista.** Cada item é um bloco; a numeração é derivada da
  posição entre irmãos, nunca armazenada. Por isso `5. / 9. / 3.` volta como
  `1. / 2. / 3.`.
- **`collapsed` é estado de view**, não vai para o markdown.
- **Marcador sozinho é bloco vazio.** `#`, `-`, `1.` e `[]` sem texto viram
  bloco vazio daquele tipo, porque `Enter` cria bloco vazio o tempo todo e isso
  precisa sobreviver ao round-trip.
- **O documento nunca fica vazio:** sempre sobra um parágrafo, senão não
  haveria onde pôr o caret.
- **Linhas em branco somem no round-trip.** Não existe bloco vazio no modelo,
  então `parse` ignora linha em branco e `serialize` não emite nenhuma.
- **Sem formatação inline** (negrito/itálico/link). O gancho `renderInline` já
  existe do lado do adapter.

### Limitações conhecidas

- Um bloco sem filhos não tem seta. Se ele perde o último filho, `collapsed` é
  zerado junto, senão ficaria travado fechado.
- `1. [ ] x` é capturado pelo checkbox (prioridade 20 < 31), então corta uma
  sequência numerada: `1. a / 2. [ ] b / 3. c` volta como `1. a / [] b / 1. c`.

### Adicionando um tipo de bloco

Duas peças, nenhuma dentro do core. Ex.: um callout `!! texto`.

**1. A sintaxe**, aqui no modelo:

```ts
interface CalloutBlock extends BlockBase {
  readonly type: 'callout'
}

const calloutDefinition: BlockDefinition<CalloutBlock> = {
  type: 'callout',
  priority: 5,                                  // menor = testado antes
  match: (line) => /^!!\s+(.*)$/.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'callout', id: nextId(), text: match[1]!.trim(), children, collapsed: false,
  }),
  serialize: (block) => `!! ${block.text}`,
}

const registry = createDefaultRegistry().register(calloutDefinition)
const doc = new WhiteboardDocument(markdown, { registry })
```

**2. A aparência**, no adapter DOM — ver
[`ui/src/docs/architecture.md`](../../ui/src/docs/architecture.md#o-whiteboard-como-capacidade).

Aninhamento, colapso, round-trip e o atalho de digitação vêm de graça: os
atalhos passam pelo mesmo `BlockRegistry` do parser
(`document.transform()` chama `registry.resolve()`), então não existe segunda
tabela de sintaxe.

---

## `@dailly/domain`

Entidades, ports e use-cases do Daily Log.

```
domain/src/
  index.ts                         superfície pública
  entry.ts                         Entry (o registro inteiro) e NewEntry (o que o chamador escolhe)
  entry-repository.ts              a port EntryRepository e o EntryFilter
  create-entry.ts                  use-case: normaliza o corpo, carimba id e tempo, grava
  query-entries.ts                 use-case: lê a timeline
  time.ts                          Clock (instante UTC, sem fuso) · systemClock · fixedClock
  ids.ts                           IdGenerator · uuidIds · sequentialIds
  errors.ts                        EmptyBodyError · NotImplementedError
  in-memory-entry-repository.ts    a implementação de teste
  testing/                         entryRepositoryContract (subpath @dailly/domain/testing)
```

**Onde roda, porque o próximo leitor vai chutar errado: no renderer.** Os
use-cases são compostos em `ui/src/shell/main.ts` sobre um `EntryRepository`
que fala HTTP. O servidor é o *outro lado* dessa port
(`SqliteEntryRepository`), não um segundo lugar onde use-cases vivem. O que
atravessa a fita é uma `Entry` pronta, e o servidor a valida e grava sem
recarimbar.

**Decisões que moldam o pacote:**

- `EntryRepository.create` recebe uma `Entry` completa, não uma `NewEntry`
  (Emenda 1 da [ADR 0002](../../docs/adrs/0002-data-layer.md)). Com HTTP no
  meio, só assim o id continua "gerado no cliente" sem cada adapter mintar o
  seu.
- **O corpo é normalizado uma vez, na criação.** Gravar já o ponto fixo do
  `serialize` faz "abrir e salvar sem editar" ser no-op de verdade, sem
  `updatedAt` fantasma. É por isso que o domain depende do whiteboard-core.
- **`Clock` não conhece fuso.** Ele responde "que instante é agora"; "que dia é
  este instante" é do `@dailly/periods`.
- `list` devolve o `occurredAt` mais novo primeiro: a ordem é promessa da port,
  e o contract test a cobra de toda implementação.
- `update`, `delete` e `getById` estão declarados e lançam
  `NotImplementedError`: a port é declarada inteira, e a Fase 2 do
  [roadmap](../../docs/roadmap.md) os implementa.

**Quem usa:** `ui/` compõe os use-cases e implementa a port sobre HTTP;
`server/` implementa a port sobre SQLite e tipa o contrato de módulo com ela.

---

## `@dailly/periods`

O **único** ponto de conversão entre instante e dia do calendário. Existe para
que o dia pelo qual a timeline agrupa e o dia pelo qual o filtro corta não
possam discordar — só há uma implementação de "que dia é este".

```
periods/src/
  index.ts     superfície pública
  zone.ts      dayOf · timeOf · dayBounds · rangeBounds · atNoon · isSupportedTimeZone · UTC
```

- `dayOf(instante, fuso)` — o dia que a pessoa viveu. Uma entrada às 21:00 em
  São Paulo é `00:00Z` do dia seguinte, e cai no dia certo.
- `dayBounds` / `rangeBounds` — dia(s) → limites **semiabertos**
  (`>= start AND < endExclusive`), que comparam igual em qualquer precisão.
- `atNoon` — meio-dia num dia, calculado como hora de parede (não "início +
  12h", que erra em dia de horário de verão).
- Sem dependência além de `Intl`, que carrega a base IANA no browser e no node.

**Quem usa:** `ui/` (timeline, rótulo de hora, política de data da entrada);
`server/` (valida `DAILLY_TZ` no boot e traduz o `EntryFilter` em SQL).

**Deliberadamente ausente:** semana, mês e quadrimestre. As regras estão fixadas
na [ADR 0007](../../docs/adrs/0007-api-local-e-tempo.md), e entram com o
primeiro chamador, o Analyse da Fase 4.

---

## `@dailly/requests-core`

O modelo do módulo Requests: texto cru → `ProtocolSpec` → a requisição literal
que sairia na fita. **Não executa** — essa metade mora no `server/`, porque um
renderer não manda `Host`/`Origin`/`Cookie`, CORS devolve resposta opaca a
partir de `file://`, e gRPC não existe num webview
([ADR 0011](../../docs/adrs/0011-requests-modulo-e-execucao.md)).

```
requests-core/src/
  index.ts              superfície pública (sem nenhum driver)
  protocol.ts           ProtocolSpec<T> (o envelope) · ProtocolDriver · WireRequest · Imported
  registry.ts           ProtocolRegistry: o ponto de extensão, um driver por protocolo
  resolve.ts            spec + env → requisição literal; recusa variável faltando
  interpolate.ts        troca {{variável}} em qualquer profundidade, coletando as ausentes
  placeholder.ts        a sintaxe {{chave}}, escrita uma vez
  storage/
    request-store.ts    a port RequestStore e SavedRequest
    folder.ts           a árvore de pastas (parentId + position) e a regra anti-ciclo
    in-memory-request-store.ts
  testing/              requestStoreContract (subpath @dailly/requests-core/testing)
  http/                 o driver HTTP (subpath @dailly/requests-core/http)
    spec.ts             HttpSpec: método, URL, headers, corpo, query, auth
    wire.ts             HttpWire: o que sai na fita
    tokenize.ts         quebra um curl em tokens de shell
    from-raw.ts         curl → HttpSpec, relatando o que ignorou
    placeholders.ts     acha delimitadores (: = ) fora de qualquer {{chave}}, para o importador não cortar dentro dela
    base64.ts           base64 UTF-8 à mão, para o Basic (sem Buffer nem btoa nos tipos)
    index.ts            httpDriver: validate · toWire · fromRaw
```

**O ponto de extensão é o `ProtocolRegistry`**, no mesmo idioma do
`BlockRegistry`: acrescentar gRPC é um arquivo novo mais um `register()`. O
modelo não escreve o nome de protocolo nenhum, e por isso nenhum driver sai
pelo índice principal — cada um tem seu subpath.

**Três comportamentos que separam isto de um parser ingênuo:**

- **Variável sem valor recusa** (`UnresolvedVariableError`), nomeando todas as
  que faltam e, à parte, as que *sobreviveram* à substituição por virem dentro
  do valor de outra.
- **Flag desconhecida é ignorada e relatada** (`Imported.ignored`), nunca
  aplicada nem calada.
- **Pasta não fecha laço.** `wouldCycle` é propriedade da árvore, não do verbo:
  toda escrita que mexe em `parentId` pergunta a ela.

**Quem usa:** `ui/` (importar curl, montar o draft, preview com `resolve`,
montar a árvore da coleção); `server/` (implementar `RequestStore` em SQLite,
validar o spec recebido, `resolve` antes de executar).
