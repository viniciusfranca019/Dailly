# dailly

Whiteboard que renderiza markdown com blocos interativos e editáveis, no estilo
do Notion. TypeScript; o editor em si não usa framework.

```
packages/whiteboard-core/  o modelo: markdown → blocos → markdown. Sem DOM, sem framework
packages/requests-core/    o modelo: curl → ProtocolSpec → o que sai na fita. Sem DOM, sem rede
ui/src/capabilities/       adapters que os módulos consomem (o renderer DOM do whiteboard, …)
ui/src/modules/            os módulos de produto (Daily Log, Analyse, Requests, …)
ui/src/playground/         harness do whiteboard
```

O core mora em `packages/` porque dois runtimes precisam do mesmo modelo: o
renderer edita, e `createEntry` normaliza markdown na entrada
([ADR 0007, Emenda 1](docs/adrs/0007-api-local-e-tempo.md)). O renderer do
produto será Vue ([ADR 0010](docs/adrs/0010-vue-no-renderer.md)); o adapter do
whiteboard continua vanilla e é montado como ilha.

O encaixe com a persistência é o markdown, e ele já carrega tráfego: o Daily
Log guarda `toMarkdown()` no corpo da entrada e restaura com `setMarkdown()`.
O whiteboard não sabe que isso acontece — para ele, markdown entra e markdown
sai.

## Rodando

```bash
make install     # deps
make dev         # API + app em http://localhost:5173 · playground em /playground/
make dev-all     # idem, com todos os módulos ligados por flag
make desktop     # o app completo no Electron, com a API dentro
make check       # typecheck + testes
make build       # só os módulos prontos
make build-all   # com todos os módulos ligados por flag
```

Os dados vivem em dois lugares, e os comandos que os apagam são separados de
propósito:

```bash
make clean-db      # o banco de desenvolvimento (server/dailly.dev.sqlite)
make clean-db-app  # o diário de verdade (~/.config/dailly) — pede confirmação
```

`make clean` não toca em nenhum dos dois: ele apaga build e dependências.

Duas páginas no mesmo servidor: o **app** é o produto, o **playground** é o
harness onde o comportamento real de browser do whiteboard se confere a olho —
a suíte só cobre jsdom.

## Arquitetura

O ponto central: **o core não conhece nenhum framework de UI**. Ele é
TypeScript puro, sem nenhum acesso ao DOM, e a renderização mora em adapters.
Quando você escolher React/Svelte/Solid, só o adapter é reescrito — parser,
modelo de blocos e serializer continuam iguais.

```
ui/src/
  capabilities/            ← CAPACIDADES: sem ports, sem produto, sem Entry
    whiteboard/
      index.ts             superfície pública, livre de DOM (`@capabilities/whiteboard`)
      dom.ts               adapter DOM (`@capabilities/whiteboard/dom`)
      core/                  ← TS puro, zero DOM, 100% testado
        blocks.ts            modelo de blocos (união discriminada + helpers imutáveis)
        registry.ts          BlockRegistry: o ponto de extensão (match/parse/serialize)
        blocks/              uma definição por sintaxe (heading, todo, list, paragraph)
        parser/
          lines.ts           fase 1: texto → linhas com indentação medida
          index.ts           fase 2: linhas → árvore (só este arquivo entende aninhamento)
        serialize.ts         árvore → markdown normalizado
        tree.ts              operações estruturais (locate/insert/remove) da edição
        document.ts          WhiteboardDocument: estado + comandos de edição + subscribe
      adapters/dom/          ← adapter vanilla (o que vira React depois)
        registry.ts          RendererRegistry: um renderer por tipo de bloco
        renderers/           aparência de cada bloco
        caret.ts             offset do caret em caracteres (sobrevive ao re-render)
        whiteboard.ts        monta a árvore, delega cliques e teclas, reposiciona o caret
  modules/                 ← MÓDULOS DE PRODUTO: cada um com seu próprio domain
  shared/                  o que é de todos (Clock, tipos de tempo)
  playground/              harness: só o whiteboard (store exposto em window.dailly)
```

Por que o whiteboard não é um módulo irmão do Daily Log: ele **não tem ports,
não persiste e não conhece `Entry`**. É uma *capacidade* — e capacidade é uma
categoria, não um caso especial. O critério de entrada em `capabilities/`:

> índice público próprio, suíte própria, e **nenhum conhecimento do produto**.
> Se você não consegue descrever o que ela faz sem dizer "Entry", ela não é
> capacidade — é módulo.

Não confundir com `components/`, que virá se a §1 cair para React: componente é
widget, recebe props e desenha. O centro de gravidade do whiteboard é o modelo;
o DOM é adapter opcional. E não confundir com `shared/`, que também atravessa os
módulos mas guarda **contratos sem comportamento** — dezenas de linhas que todo
mundo importa, não modelos autocontidos com suíte própria.

A direção da seta é regra: `capabilities/` nunca importa de `modules/`. O seam
com o produto é markdown, e já existe: `toMarkdown()` / `setMarkdown()`.

Dentro de uma capacidade os imports são relativos com `.js`; atravessar
fronteira é sempre por alias (`@capabilities/…`, `@modules/…`, `@shared`), então
um import que cruza camada é visível a olho nu no diff — e o alias diz a camada
em voz alta no lugar de uso.

### Módulos e flags

A shell não conhece módulo nenhum pelo nome: ela lê o manifest em
`src/shell/modules.ts` e monta o que estiver lá. Um módulo entra ou sai por flag
de build.

```ts
export const MODULES = [
  { id: 'daily-log', title: 'Daily Log', route: '/', load: () => import('@modules/daily-log') },
  ...(import.meta.env.VITE_ANALYSE === 'true'
    ? [{ id: 'analyse', title: 'Analyse', route: '/analyse', load: () => import('@modules/analyse') }]
    : []),
  ...(import.meta.env.VITE_REQUESTS === 'true'
    ? [{ id: 'requests', title: 'Requests', route: '/requests', load: () => import('@modules/requests') }]
    : []),
]
```

A forma da flag não é estética. O vite só dobra **comparação estática com
literal** — `VITE_MODULES.includes('analyse')` é operação de string em runtime e
sobrevive no bundle. E o `import()` tem que estar **dentro** do ramo que dobra,
senão o chunk é emitido mesmo com a flag desligada:

```
make build       →  app 2.55 kB, sem analyse-*.js
make build-all   →  app 2.65 kB + analyse-B-mS_dY9.js
```

Não confunda com o outro nível de composição: `BlockRegistry` e
`RendererRegistry` compõem **blocos** dentro do whiteboard. O manifest compõe
**módulos**. Grãos diferentes, mecanismos diferentes.

### O servidor tem as mesmas duas camadas

`server/` nasceu plano e deixou de caber assim quando o segundo módulo foi
decidido — ele ainda não existe. Hoje o servidor espelha a `ui/`
([ADR 0006, Emenda 2](docs/adrs/0006-modularizacao-frontend.md)):

```
server/src/
  shell/        config · database · runner de migrations · buildApp · /health
  modules.ts    o manifest — ServerModule { id, migrations, register(app, deps) }
  modules/
    entries/    routes · validate · migrations · index
  adapters/     sqlite-entry-repository — implementa port de pacote, não de módulo
  index.ts      composition root
```

O adapter mora fora de `modules/` porque implementa `EntryRepository`, port do
**pacote** `@dailly/domain` — não do módulo. É o mesmo critério que põe o
`http-entry-repository.ts` em `ui/src/adapters/`.

Duas diferenças em relação ao frontend. **Não há flag de build**: lá a flag
remove código de um bundle que o usuário baixa, e aqui não há bundle — uma rota
desligada não custa nada a ninguém.

E **as migrations são uma sequência global**, não uma por módulo, porque
`PRAGMA user_version` é um inteiro por arquivo. Cada módulo declara sua fatia, o
shell concatena e ordena, e `collectMigrations` recusa colisão nomeando a versão
e os dois módulos — antes de abrir o banco, para que um manifest inconsistente
derrube o boot sem ter escrito nada.

### A fronteira é testada, não combinada

Cinco testes varrem o source e falham nomeando o arquivo culpado, cada um onde
a regra é verificável:

- `ui/src/architecture.test.ts` — as camadas da `ui/`: o whiteboard importando um
  módulo, um módulo furando outro por caminho profundo em vez do index público,
  alguém entrando no `shell/`.
- `server/src/architecture.test.ts` — as mesmas duas setas do outro lado: o
  shell conhece o manifest e nunca um módulo, e um módulo alcança outro só pelo
  index público.
- `packages/requests-core/src/architecture.test.ts` — duas regras: o modelo não
  conhece protocolo nenhum (nem por import, nem por string), e a metade pura não
  executa (`node:http`, `undici`, `fetch`). A primeira é o que torna gRPC um
  arquivo novo em vez de uma edição no núcleo; a segunda é a fronteira da
  [ADR 0011](docs/adrs/0011-requests-modulo-e-execucao.md).
- `packages/whiteboard-core/src/architecture.test.ts` — DOM no core. O
  `tsconfig` do pacote já não carrega a lib DOM, então o compilador pega o caso
  tipado; o teste pega o que tipo não vê.
- `architecture.test.ts` na raiz — as setas **entre** projetos, que nenhum
  projeto sozinho enxerga: `packages/` não importa de `ui/` nem de `server/`, e
  os dois não se importam ([ADR 0007](docs/adrs/0007-api-local-e-tempo.md)).

### O fluxo

```
markdown ──parse──► Block[] ──render──► DOM
                      ▲                  │
                      └──── click ───────┘
                              │
                          serialize
                              ▼
                          markdown
```

Round-trip é requisito, não enfeite: clicar num checkbox tem que produzir `[x]`
no markdown, senão a interatividade é só cosmética. `serialize(parse(md)) === md`
para qualquer fonte normalizada, e é testado.

## Editando (o jeito Notion)

Clique em qualquer texto e edite direto no bloco renderizado — não existe modo
de edição separado.

| Tecla | O que faz |
|---|---|
| `# ` `## ` … `#### ` | vira Heading (o **espaço** é o gatilho) |
| `- ` `* ` `+ ` | vira lista com bullet |
| `1. ` `1) ` | vira lista ordenada |
| `[] ` | vira checkbox |
| `Enter` | novo bloco, continuando o tipo do atual |
| `Enter` num bloco vazio | sai da construção (vira parágrafo) |
| `Backspace` no início | tira a construção; se já for parágrafo, funde com o bloco de cima |
| `Tab` / `Shift+Tab` | indenta / desindenta |
| `↑` / `↓` nas bordas da linha | pula para o bloco anterior / seguinte |

### Como funciona por dentro

Cada bloco tem seu próprio `contenteditable` (não existe um `contenteditable`
gigante — esse é o caminho que leva a reescrever o ProseMirror). A divisão:

- **`input`** → só texto. O DOM já mostra o que foi digitado, então o adapter
  empurra pro store com uma flag `editing` e **não re-renderiza** — re-renderizar
  a cada tecla mataria o caret.
- **`keydown`** → estrutura (Enter/Backspace/Tab/setas). Aí sim re-renderiza, e o
  adapter recoloca o caret pelo offset em caracteres, que sobrevive ao
  re-render (referência de nó não sobrevive).

Os atalhos de markdown **passam pelo mesmo `BlockRegistry` do parser**
(`document.transform()` chama `registry.resolve()`). Não existe uma segunda
tabela de sintaxe: registrou um bloco novo, ele já ganha o atalho de digitação.

A regra do gatilho é uma só: **o texto antes do caret tem que ser exatamente
marcador + espaço**. Com isso:

- digitar `- ` na frente de um texto que já existe converte o bloco e mantém o
  texto (igual Notion);
- **converte entre construções**: `## ` na frente de um item de lista vira
  título, `- ` na frente de um título vira lista, e assim por diante — filhos e
  estado de colapso vêm junto;
- **muda o que é do mesmo tipo**: `### ` num heading troca o nível, `># ` num
  heading troca o nível;
- redigitar exatamente o mesmo marcador (`- ` num bloco que já é bullet) é
  no-op: o marcador digitado some e o bloco fica como estava — com uma exceção
  útil, `[] ` num `[x]` desmarca, porque é o que o marcador digitado diz;
- digitar `# ` no meio de uma frase não faz nada, porque aí o texto antes do
  caret não é só o marcador.

### Limitações da edição

**Seleção entre blocos existe** — `Shift`+`↑`/`↓` toma blocos, `Ctrl`+`A`
progride do texto para o board inteiro, e sobre a seleção valem `Alt`+`↑`/`↓`
para mover, `Tab` / `Shift`+`Tab` / `Ctrl`+`D` para indentar e `Backspace` /
`Del` para apagar. Ela é estado do adapter; o core só recebe ids e reconstrói a
lista de irmãos.

O que continua de fora, de propósito:

- **Undo do navegador** não atravessa mudança estrutural: cada re-render zera a
  pilha nativa. Um undo de verdade é histórico no store.
- **Formatação inline** (negrito/itálico/link) — a matemática de offset do caret
  assume um nó de texto por bloco. É exatamente aqui que se troca por um editor
  de verdade, se precisar.
- `Shift+Enter` quebra bloco igual `Enter`: não existe soft line break no modelo.
- `↑`/`↓` andam por bloco, não por linha visual (importa em texto que quebra).
- `Shift+Tab` não arrasta os irmãos seguintes junto (o Notion arrasta).
- `Delete` no fim do bloco não funde com o de baixo — só `Backspace` no início
  tem o comportamento de fusão.
- **Só testado em jsdom.** A suíte cobre a lógica de edição inteira, mas
  comportamento real de navegador (principalmente Firefox, que não tem
  `contenteditable="plaintext-only"` e insere `<br>` em bloco esvaziado) não foi
  verificado a olho. `make dev` é o lugar de conferir.

## Sintaxe suportada

| Sintaxe | Bloco | Observação |
|---|---|---|
| `# t` … `#### t` | Heading h1–h4 | `#####` ou mais vira parágrafo, não é clampado |
| `[] t` / `[ ] t` / `[x] t` | Checkbox | forma Notion (sem bullet) |
| `- [ ] t` / `1. [x] t` | Checkbox | forma GFM, normalizada para `[] ` (num item numerado, vira checkbox e interrompe a numeração) |
| `- t` / `* t` / `+ t` | Lista com bullet | normalizado para `- ` |
| `1. t` / `1) t` | Lista ordenada | renumerada a partir de 1 |
| qualquer outra linha | Parágrafo | fallback |

Aninhamento é por **indentação** (tab = 4 espaços na leitura, 2 espaços na
escrita). Qualquer linha indentada mais que a anterior vira filha dela.

**Toggle não tem sintaxe própria:** aninhar já é o toggle. Todo bloco com algo
indentado embaixo ganha a setinha e colapsa — heading, item de lista, checkbox,
qualquer um. Um `##` com filhos é a toggle section; um `-` com filhos é a
toggle list.

### Decisões que valem registrar

- **Toggle não tem marcador.** Não existe sintaxe de toggle: **qualquer bloco
  com filhos colapsa**, e é só isso que `isCollapsible` verifica. Por isso todo
  heading é uma toggle section — `##` é exatamente o que `>##` era — e uma
  "toggle list" é só um item com filhos indentados. O `>` ficou livre: virou
  texto comum, e blockquote hoje é um `register()` de distância.
- **Sem container de lista.** Igual ao Notion: cada item é um bloco. A
  numeração é derivada da posição entre irmãos, nunca armazenada — por isso
  `5. / 9. / 3.` volta como `1. / 2. / 3.`.
- **`collapsed` é estado de view**, não vai para o markdown.
- **Sem formatação inline** (negrito/itálico/link) — não foi pedido. O gancho
  `renderInline` já existe no `RenderContext`, então vira mudança de um lugar só.
- **Marcador sozinho é bloco vazio.** `#`, `-`, `1.` e `[]` sem texto viram
  bloco vazio daquele tipo, não parágrafo — `Enter` cria bloco vazio o tempo
  todo, então isso precisa sobreviver ao round-trip. É o comportamento do
  CommonMark para ATX heading.
- **O documento nunca fica vazio:** sempre sobra um parágrafo, senão não haveria
  onde pôr o caret num board zerado.
- **Linhas em branco somem no round-trip.** Não existe bloco vazio no modelo,
  então `parse` ignora linha em branco e `serialize` não emite nenhuma — o
  primeiro clique num checkbox reescreve a fonte sem elas. Dentro de um bloco
  indentado a linha em branco *não* fecha a seção (isso é testado); ela só não
  sobrevive à serialização. Modelar um bloco vazio resolve, quando incomodar.

### Limitações conhecidas

- Um bloco sem filhos não tem seta — não há o que colapsar. Se ele perde o
  último filho, o `collapsed` é zerado junto, senão ficaria travado fechado.
- `1. [ ] x` é capturado pelo checkbox (prioridade 20 < 31), então corta uma
  sequência numerada: `1. a / 2. [ ] b / 3. c` volta como `1. a / [] b / 1. c`.

## Requests

Um cliente de API no estilo Apidog/Postman: cola um `curl`, ele vira uma request
editável, e a resposta aparece. Hoje só HTTP; a estrutura aceita gRPC e AMQP
amanhã sem reescrever o modelo ([ADR 0011](docs/adrs/0011-requests-modulo-e-execucao.md)).

O que decide a forma inteira é **onde a requisição é executada: no servidor.**
Não pelo custo do hop — pelo que o renderer não consegue fazer. `Host`,
`Origin`, `Cookie`, `Referer` e `User-Agent` não podem ser definidos por `fetch`
no browser, e um cliente de API que não manda `Cookie` não testa autenticação.
A origem do renderer é `file://` em produção, então a resposta volta opaca por
CORS — sem status, sem headers, sem corpo. E gRPC não existe num webview.

Daí o corte em duas metades:

```
packages/requests-core/         puro: ProtocolSpec · ProtocolRegistry · fromRaw · resolve
  http/                         o driver HTTP, atrás do subpath @dailly/requests-core/http
server/src/modules/requests/    a metade que executa: persistência, coleção, execute
ui/src/modules/requests/        a tela, atrás da flag VITE_REQUESTS
ui/src/adapters/http-requests-client.ts   a port da tela, sobre as rotas do servidor
```

A metade pura roda nos dois runtimes: o renderer importa um curl e mostra o
preview literal com `resolve()`, sem viagem nenhuma — era a única virtude do
híbrido "o servidor monta, a UI executa", e ela sai de graça aqui.

**Executar grava antes de rodar.** A rota é `POST /requests/:id/execute`, então o
servidor executa o que está guardado — e sem gravar antes a tela mostraria uma URL
enquanto a rede recebe outra. É o modelo do Insomnia, por clique em vez de por
tecla, com o preço que ele cobra: todo experimento persiste. Em troca, o que está
na tela é sempre o que sai, e colar um curl e executar é um clique.

A tela é o arranjo da categoria: método, URL e Enviar numa linha, Params ·
Headers · Body · Auth em abas, resposta embaixo, coleção **à direita**. E o curl
entra **pela barra de URL**, como no Postman — não há painel separado para colar.

Na coleção, um `+` no cabeçalho e outro em cada pasta abrem *Nova request* /
*Nova pasta*. Onde a coisa nasce é dito por qual `+` foi clicado, e por isso não
existe campo perguntando "dentro de quê" — era assim que a pasta-mãe de uma
tentativa sobrevivia para a seguinte. À direita e
não à esquerda como a categoria faz: a navegação do shell já é uma barra à
esquerda, e duas coladas fazem a pessoa procurar em qual das duas está o que
ela quer.

Dois comportamentos que separam isto de um parser ingênuo:

- **Variável sem valor recusa a requisição**, nomeando todas as que faltam. Todo
  cliente de API deixa `{{token}}` virar texto e sair na rede; o servidor
  responde 401 e a pessoa procura o erro na autenticação.
- **Flag desconhecida é ignorada e relatada**, nunca aplicada em silêncio. O
  DevTools põe `--compressed` em quase todo curl, então recusar tudo tornaria a
  função inútil; ignorar calado é o que faz alguém colar um `--cert` achando que
  foi aplicado.
- **Corpo comprimido é aberto na tela, ou dito.** O servidor entrega os bytes
  marcados e quem descomprime é quem mostra. `gzip` e `deflate` abrem; **brotli
  não** — nenhum navegador expõe `br` por `DecompressionStream`, e o
  copy-as-cURL do Firefox manda `Accept-Encoding: gzip, deflate, br`. Então `br`
  chega, e chega dito, nunca como uma parede de U+FFFD.

O que **não** está neste corte, e por quê: apagar e renomear pasta (o servidor
não tem a rota), arrastar request entre pastas (o `select` de pasta faz o mesmo
com menos UI) e histórico de execução (outro schema, ninguém pediu — a resposta
vive enquanto a tela a mostra).

## Adicionando um novo tipo de bloco

Duas peças, nenhuma delas dentro do core. Ex.: um callout `!! texto`.

**1. A sintaxe** (parse + serialize):

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

**2. A aparência**:

```ts
const calloutRenderer: BlockRenderer<CalloutBlock> = {
  type: 'callout',
  render: (block, ctx) => el(ctx.doc, 'aside', { className: 'wb-callout', text: block.text }),
}

mountWhiteboard(container, doc, {
  renderers: createDefaultRendererRegistry().register(calloutRenderer),
})
```

Aninhamento, colapso e round-trip funcionam de graça. Sintaxe e aparência são
registries separados de propósito: dá para trocar uma sem tocar na outra.
`ui/src/capabilities/whiteboard/extensibility.test.ts` é exatamente esse exemplo, rodando.

## Testes

```bash
make test
```

Cada teste mora ao lado do que testa, então o módulo carrega a própria suíte:

- `packages/whiteboard-core/src/parser/index.test.ts` — sintaxe de cada bloco e aninhamento
- `packages/whiteboard-core/src/serialize.test.ts` — normalização e idempotência do round-trip
- `packages/whiteboard-core/src/document.test.ts` — interações e imutabilidade da árvore
- `packages/whiteboard-core/src/editing.test.ts` — split/merge/indent/outdent/transform na árvore pura
- `ui/src/capabilities/whiteboard/adapters/dom/whiteboard.test.ts` — render + clique real (jsdom) voltando pro markdown
- `ui/src/capabilities/whiteboard/adapters/dom/editing.test.ts` — digitação, atalhos, Enter/Backspace/Tab/setas e paste
- `packages/whiteboard-core/src/selection.test.ts` — mover, indentar e desindentar um conjunto de blocos
- `ui/src/capabilities/whiteboard/adapters/dom/selection.test.ts` — Shift/Alt/Tab/Ctrl+D/Ctrl+A e o que o destaque segue
- `ui/src/capabilities/whiteboard/extensibility.test.ts` — bloco novo registrado de fora do core
- `ui/src/shell/composition.test.ts` — o manifest real monta o Daily Log real
- `ui/src/playground/main.test.ts` — o playground renderiza e edita de verdade
- os três `architecture.test.ts` — as fronteiras (ver acima); transversais, não são de módulo nenhum

## Licença

Copyright 2026 Vinicius França (@viniciusfranca019)

Apache License 2.0 — o texto completo está em [`LICENSE`](LICENSE).
