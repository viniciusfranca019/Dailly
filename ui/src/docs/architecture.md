# Arquitetura — `ui/`

A `ui/` é o renderer: uma única aplicação Vue 3 que monta os módulos de produto
e roda os use-cases do Daily Log. Ela não tem banco nem rede própria — tudo que
persiste ou executa passa pela API local
([`server/src/docs/architecture.md`](../../../server/src/docs/architecture.md)).

O ponto central: **as regras moram fora dos componentes**. O modelo vem dos
[pacotes](../../../packages/docs/architecture.md), a política de cada tela mora
em `.ts` puros ao lado dela, e o `.vue` só desenha. Um bug de fuso que só se
reproduz montando um componente é um bug que ninguém reproduz.

## Estrutura

```
ui/src/
  index.html                 entrada do app
  shell/                     ← COMPOSIÇÃO: o único lugar que conhece todas as escolhas concretas
    main.ts                  composition root: ApiConfig, repositório HTTP, use-cases, fuso, clock
    modules.ts               o manifest: quais módulos entram neste build (por flag)
    mount.ts                 mountShell: roteia, carrega módulo sob demanda, trata falha e corrida
    Shell.vue                a moldura: sidebar, navegação, fuso na tela, outlet
  shared/                    ← CONTRATOS sem comportamento, que todo mundo importa
    module.ts                ModuleDescriptor · assertManifest · findByRoute
    vue-module.ts            VueModule: um módulo é um componente
    deps.ts                  ModuleDeps: o que a raiz entrega a todo módulo
    requests.ts              RequestsPort e os erros da execução, nas palavras da tela
  adapters/                  ← o outro lado das ports, sobre HTTP
    api.ts                   onde está a API: /api no dev, bridge do Electron em produção
    http.ts                  a chamada comum: token, content-type, 204, "recusou" vs "ninguém atendeu"
    errors.ts                ApiError · ApiUnreachableError
    http-entry-repository.ts EntryRepository sobre /entries
    http-requests-client.ts  RequestsPort sobre /requests, validando o payload na borda
  capabilities/              ← CAPACIDADES: sem ports, sem produto, sem Entry
    whiteboard/
      dom.ts                 entrada pública (@capabilities/whiteboard/dom)
      adapters/dom/          o adapter vanilla do whiteboard-core
  modules/                   ← MÓDULOS DE PRODUTO, um componente cada
    daily-log/               a timeline e o composer
    requests/                o cliente de API
    analyse/                 placeholder da Fase 4/5, atrás de flag
  playground/                harness do whiteboard, sem produto (/playground/)
```

## As camadas e a direção da seta

| Camada | Pode importar | Não pode (testado) |
|---|---|---|
| `shell/` | tudo | — |
| `modules/<m>/` | `@shared`, `@capabilities/*` (só a entrada pública), `@dailly/*`, o index de outro módulo | `shell/`, `adapters/`, o interior de outro módulo |
| `capabilities/<c>/` | `@dailly/*` | `modules/`, `shell/`, `adapters/` |
| `shared/` | `@dailly/*` | `modules/`, `capabilities/` |
| `adapters/` | `@shared`, `@dailly/*` | `shell/` |

Atravessar camada é sempre por **alias** (`@modules/…`, `@capabilities/…`,
`@shared`, declarados em `alias.config.ts`); dentro de uma camada, import
relativo com `.js`. Assim um import que cruza fronteira aparece a olho nu no
diff. Não existe `@shell`: ninguém fora do shell deveria precisar dele.

`src/architecture.test.ts` varre `.ts` e o `<script>` dos `.vue` e falha
nomeando o arquivo: capability importando módulo, módulo furando outro por
caminho fundo, alguém importando o composition root, módulo ou capability
alcançando `adapters/`.

**Por que o whiteboard não é um módulo.** Ele não tem ports, não persiste e não
conhece `Entry`. O critério de entrada em `capabilities/`:

> índice público próprio, suíte própria, e **nenhum conhecimento do produto**.
> Se você não consegue descrever o que ela faz sem dizer "Entry", ela não é
> capacidade — é módulo.

`shared/` também atravessa os módulos, mas guarda **contratos sem
comportamento**: dezenas de linhas que todo mundo importa, não modelos com suíte
própria.

## Composição: do boot à tela

```
main.ts
  resolveApiConfig()           ─► { baseUrl, token? }
  httpEntryRepository(config)  ─► createEntry · queryEntries  (de @dailly/domain)
  GET /health                  ─► zone  (UTC se a API não responder)
  httpRequestsClient(config)   ─► requests
  mountShell(host, { modules: MODULES, deps })
        └─► Shell.vue ─► <component :is="módulo" :deps="deps" />
```

- **`ModuleDeps`** leva use-cases, nunca um repositório
  ([ADR 0001](../../../docs/adrs/0001-arquitetura-geral.md)), mais `zone` (a
  tela sempre mostra o fuso em uso — ADR 0007) e `now()` (quem diz "Hoje"
  precisa ser testável em qualquer dia).
- **Dívida anotada:** `requests` está no mesmo saco, então o Daily Log recebe
  uma port que nunca chama. O gatilho da correção está combinado em
  `shared/deps.ts` — partir o contrato em "de todo módulo" e "deste módulo",
  como o `provide` fez no servidor.
- **`mountShell`** carrega cada módulo na primeira visita, guarda a *promise*
  (dois cliques dividem um `load()`), descarta a rejeitada para permitir nova
  tentativa, e resolve a corrida pelo último pedido — não pelo último que
  terminou.
- **Uma aplicação só.** Um módulo é um componente
  ([ADR 0010, Emenda 2](../../../docs/adrs/0010-vue-no-renderer.md)), então um
  plugin instalado em `configure(app)` alcança todos.

### Módulos e flags

O shell não conhece módulo nenhum pelo nome: lê `shell/modules.ts` e monta o
que estiver lá. Um módulo entra ou sai por **flag de build**.

| Módulo | Rota | Flag | Estado |
|---|---|---|---|
| `daily-log` | `/` | sempre ligado | Fase 1 concluída |
| `requests` | `/requests` | `VITE_REQUESTS=true` | entregue |
| `analyse` | `/analyse` | `VITE_ANALYSE=true` | placeholder |

A forma da flag não é estética. O vite só dobra **comparação estática com
literal** (`=== 'true'`), e o `import()` tem que estar **dentro** do ramo que
dobra, senão o chunk é emitido mesmo com a flag desligada:

```
make build       →  sem analyse-*.js
make build-all   →  com analyse-*.js
```

Não confundir os dois níveis de composição: o manifest compõe **módulos**;
`BlockRegistry` e `RendererRegistry` compõem **blocos** dentro do whiteboard.

### Onde está a API

| Ambiente | `baseUrl` | Token |
|---|---|---|
| dev (`make dev`) | `/api`, que o vite faz proxy para `127.0.0.1:4317` | nenhum |
| Electron | a porta efêmera que o main process escolheu | por execução, pedido via `window.dailly.apiConfig()` |

O token nunca vai em query string nem em `argv`: o preload expõe uma *função*,
e o valor atravessa por IPC só quando pedido.

---

## Os módulos

### `daily-log`

```
modules/daily-log/
  index.ts                 exporta o componente
  ui/
    DailyLog.vue           a tela: escolhe o dia, cria a entrada, recarrega a timeline
    Composer.vue           ilha do whiteboard: monta mountWhiteboard num ref, lê toMarkdown()
    Timeline.vue           dias agrupados
    TimelineEntry.vue      um cartão: título e hora no fuso do servidor
    timeline.ts            groupByDay · formatDay · titleOf (puro)
    entry-date.ts          occurredAtFor · isLoggable (a política da data)
```

**A política da data** (`entry-date.ts`): escrever sobre **hoje** carimba o
instante atual; sobre **um dia anterior**, carimba meio-dia daquele dia — o
seletor deu um dia, não uma hora, e meio-dia é a hora que não afirma nada. Dia
futuro não é aceito. A regra é da tela, não do domain.

### `requests`

```
modules/requests/
  index.ts                 exporta o componente
  ui/
    Requests.vue           orquestra: coleção, draft, execução, resposta
    RequestEditor.vue      método + URL + Enviar; abas Params · Headers · Body · Auth
    ResponseView.vue       status, headers, corpo decodificado, marcas de truncado/prazo
    Collections.vue        a coleção à direita, com o + do cabeçalho
    FolderNode.vue         uma pasta e o seu +
    FolderForm.vue         nome da pasta nova
    AddMenu.vue            Nova request / Nova pasta
    draft.ts               importCurl · draftOf · savedOf (spec ↔ o que a tela edita)
    tree.ts                buildTree: pastas + requests → árvore
    env.ts                 parseEnv: NOME=valor, uma por linha
    decode.ts              decodeBody: gzip/deflate abrem; br é dito, nunca U+FFFD
    ids.ts                 id de pasta/request nova (sai quando ModuleDeps for partido)
```

- **O curl entra pela barra de URL**, como no Postman. `importCurl` usa o
  `fromRaw` do driver HTTP e mostra o que foi ignorado.
- **Executar grava antes de rodar.** A rota executa o que está guardado; sem
  gravar antes, a tela mostraria uma URL enquanto a rede recebe outra. Todo
  experimento persiste — o preço do modelo Insomnia.
- **A coleção fica à direita** porque a navegação do shell já é uma barra à
  esquerda. Onde uma coisa nasce é dito por qual `+` foi clicado.
- **Fora deste corte:** apagar/renomear pasta, arrastar request entre pastas,
  histórico de execução.

A tradução de status HTTP para o que a tela mostra mora em
`adapters/http-requests-client.ts`: `MissingVariablesError` (com os nomes) e
`ExecutionFailedError` com `offline` · `refused` · `unreachable` · `timeout`.

### `analyse`

Placeholder da Fase 4/5 do [roadmap](../../../docs/roadmap.md). Existe para
manter a flag honesta: ligada, o chunk aparece; desligada, não.

---

## O whiteboard como capacidade

O **modelo** (parser, blocos, serializer, `WhiteboardDocument`) é o pacote
`@dailly/whiteboard-core`. Aqui mora só o **adapter DOM**, vanilla, montado
como ilha dentro do Vue ([ADR 0010](../../../docs/adrs/0010-vue-no-renderer.md)).

```
capabilities/whiteboard/
  dom.ts                     entrada pública; importa o CSS
  extensibility.test.ts      um bloco novo registrado de fora do core, rodando
  adapters/dom/
    index.ts                 mountWhiteboard · RendererRegistry · helpers
    whiteboard.ts            o host: wrapper de bloco, seta de colapso, um listener delegado
    registry.ts              RendererRegistry: um renderer por tipo de bloco
    renderers/               a aparência de cada bloco
    actions.ts               data-wb-action: o renderer marca, o host chama o store
    caret.ts                 offset do caret em caracteres (sobrevive ao re-render)
    dom.ts                   el() e helpers pequenos
    whiteboard.css
```

**Quem usa:** `modules/daily-log/ui/Composer.vue` e o `playground/`.

### Editando (o jeito Notion)

Clique em qualquer texto e edite direto no bloco — não existe modo de edição.

| Tecla | O que faz |
|---|---|
| `# ` `## ` … `#### ` | vira Heading (o **espaço** é o gatilho) |
| `- ` `* ` `+ ` | vira lista com bullet |
| `1. ` `1) ` | vira lista ordenada |
| `[] ` | vira checkbox |
| `Enter` | novo bloco, continuando o tipo do atual |
| `Enter` num bloco vazio | sai da construção (vira parágrafo) |
| `Backspace` no início | tira a construção; se já for parágrafo, funde com o de cima |
| `Tab` / `Shift+Tab` | indenta / desindenta |
| `↑` / `↓` nas bordas da linha | pula para o bloco anterior / seguinte |
| `Shift+↑/↓` · `Ctrl+A` | seleciona blocos · progride do texto para o board inteiro |
| sobre a seleção: `Alt+↑/↓` · `Tab`/`Shift+Tab`/`Ctrl+D` · `Backspace`/`Del` | move · indenta · apaga |

A regra do gatilho é uma só: **o texto antes do caret tem que ser exatamente
marcador + espaço**. Por isso `- ` na frente de um texto existente converte o
bloco e mantém o texto, `## ` num item de lista vira título (filhos vêm junto),
redigitar o mesmo marcador é no-op (exceto `[] ` num `[x]`, que desmarca), e
`# ` no meio de uma frase não faz nada.

### Como funciona por dentro

Cada bloco tem o **seu** `contenteditable` — um só gigante é o caminho que leva
a reescrever o ProseMirror.

- **`input`** → só texto. O DOM já mostra o que foi digitado, então o adapter
  empurra para o store com a flag `editing` e **não re-renderiza**, senão
  mataria o caret.
- **`keydown`** → estrutura (Enter/Backspace/Tab/setas). Aí re-renderiza e
  recoloca o caret pelo offset em caracteres, que sobrevive ao re-render
  (referência de nó não sobrevive).
- **Os atalhos passam pelo `BlockRegistry` do parser**, então registrar um
  bloco novo já lhe dá atalho de digitação.
- **Seleção entre blocos é estado do adapter**; o core só recebe ids.

Para registrar a aparência de um bloco novo (a sintaxe está em
[`packages/docs/architecture.md`](../../../packages/docs/architecture.md#adicionando-um-tipo-de-bloco)):

```ts
const calloutRenderer: BlockRenderer<CalloutBlock> = {
  type: 'callout',
  render: (block, ctx) => el(ctx.doc, 'aside', { className: 'wb-callout', text: block.text }),
}

mountWhiteboard(container, doc, {
  renderers: createDefaultRendererRegistry().register(calloutRenderer),
})
```

### Limitações da edição

- **Undo do navegador** não atravessa mudança estrutural: cada re-render zera a
  pilha nativa. Undo de verdade é histórico no store.
- **Formatação inline** — a matemática do caret assume um nó de texto por bloco.
- `Shift+Enter` quebra bloco igual `Enter`: não há soft line break no modelo.
- `↑`/`↓` andam por bloco, não por linha visual.
- `Shift+Tab` não arrasta os irmãos seguintes (o Notion arrasta).
- `Delete` no fim do bloco não funde com o de baixo.
- **Só testado em jsdom.** Comportamento real de browser (principalmente
  Firefox, sem `contenteditable="plaintext-only"`) se confere no
  `/playground/`, com `make dev`.

## Testes

Cada teste mora ao lado do que testa. Os que prendem a arquitetura:

| Arquivo | Prova |
|---|---|
| `architecture.test.ts` | as setas da tabela acima |
| `shell/composition.test.ts` | o manifest real monta os módulos reais (com `make test-all`, os três) |
| `shell/mount.test.ts` · `navigation.test.ts` | carga sob demanda, falha, corrida entre cliques |
| `adapters/*.test.ts` | os adapters HTTP contra respostas reais e malformadas |
| `capabilities/whiteboard/adapters/dom/*.test.ts` | render, digitação, atalhos, seleção (jsdom) |
| `capabilities/whiteboard/extensibility.test.ts` | bloco novo registrado de fora do core |
| `playground/main.test.ts` | o playground renderiza e edita de verdade |
