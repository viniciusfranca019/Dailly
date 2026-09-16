# ADR 0006 — Modularização do frontend

- **Status:** Aceito · a decisão "pacote único" foi **superseded** pela
  [ADR 0007](0007-api-local-e-tempo.md), que traz o workspace por um gatilho
  diferente do previsto: dois runtimes compartilhando domain
- **Data:** 2026-09-15
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001 — Arquitetura Geral](0001-arquitetura-geral.md) ·
  [ADR 0003 — UI](0003-ui.md) · [adaptacao-dailly.md](../adaptacao-dailly.md)

## Contexto

O diretório do frontend (então `ui/`, hoje `app/`) era inteiro o domain do
whiteboard: `src/core` e `src/adapters/dom` não
tinham acima de si nenhuma noção de módulo, e o vite estava preso ao playground
por uma linha (`root: 'src/demo'`).

O roadmap pede três módulos de produto — Daily Log, Analyse e Settings — e a
ADR 0001 declara que o padrão "um módulo consome o material de outro" deve se
repetir para módulos futuros. Sem uma fronteira declarada, esse consumo vira
import direto de interno e o padrão morre no primeiro atalho.

Duas decisões continuam **abertas** e a modularização não pode forçar nenhuma
delas: o adapter que renderiza as telas que não são o whiteboard (React vs.
vanilla, §1 da adaptação) e o alvo de execução (Tauri vs. browser, §2).

## Decisão

### Duas camadas, não uma lista de módulos

O whiteboard **não** é um módulo irmão do Daily Log. É uma **capacidade**: não
tem ports, não persiste e não conhece `Entry`. Daily Log e Analyse são **módulos
de produto**: têm domain, ports, use-cases e persistência.

```
app/src/
  app/          composition root: shell, manifest, flags
  modules/      módulos de produto — cada um com SEU domain, ports, use-cases, ui
  capabilities/ capacidades — autocontidas, sem produto (whiteboard, …)
  shared/       o que é de todos (contrato de módulo, Clock, tipos de tempo)
  playground/   harness do whiteboard
```

O diretório se chama `app/` e não `ui/` porque `modules/` guarda domain, e vai
guardar ports e use-cases na Fase 1. `ui/` descrevia o que o diretório era
quando só existia o whiteboard; deixar o nome faria a camada de dados morar num
diretório chamado "ui". O `ui/` que sobrevive é o de dentro de cada módulo —
`modules/daily-log/ui/` — e aí o nome está certo.

### Testes moram no módulo, não numa árvore paralela

`app/src/capabilities/whiteboard/core/serialize.test.ts`, não
`tests/whiteboard/serialize.test.ts`.

A primeira versão desta ADR preservou o `tests/` espelhando `src/` que o repo já
tinha, e isso contradizia a própria tese: um módulo não é autocontido se apagá-lo
exige lembrar de uma segunda árvore. Mover ou remover um módulo agora leva a
suíte junto, e a fronteira que o teste de arquitetura cobra no nível de import
passa a valer também para o layout.

Um teste transversal não pertence a módulo nenhum e fica na raiz de `src/`:
`architecture.test.ts` varre tudo, então é o único que não tem dono.

Preço: arquivos de teste interleaved no `src/`. Não entram no bundle (nenhuma
entrada os importa), mas aparecem ao navegar o código.

Achatar os dois em `modules/*` seria mais simples de escrever e errado de
manter: o Daily Log começaria a importar interno do whiteboard e o whiteboard
passaria a conhecer `Entry` — dissolvendo o seam que a `adaptacao-dailly.md`
fixou (`Entry.body = doc.toMarkdown()`).

### `capabilities/` é categoria, não caso especial

O whiteboard não fica solto na raiz do `src/`, porque isso o trataria como
exceção. Ele é o primeiro de um tipo que já tem candidatos nomeados: um **motor
de períodos** (semana/mês/quadrimestre e limites de fuso, que o Daily Log usa
para filtrar e o Analyse para recortar) e um **renderizador de markdown** (a
ADR 0003 define materialização como markdown).

Critério de entrada, para a pasta não virar gaveta:

> Uma capacidade tem índice público próprio, suíte própria e **nenhum
> conhecimento do produto**. Se não dá para descrever o que ela faz sem dizer
> "Entry", não é capacidade — é módulo.

E a distinção de `shared/`, que também atravessa os módulos:

| | `shared/` | `capabilities/` |
|---|---|---|
| O que é | contratos e primitivos | modelos autocontidos com comportamento |
| Tamanho | dezenas de linhas | centenas, com suíte |
| Quem importa | todo mundo, sempre | o módulo que precisar, seletivamente |
| Extraível para pacote | não faria sentido | é o gatilho documentado abaixo |

O alias é o prefixo `@capabilities/…`, não um atalho por capacidade
(`@whiteboard`). Custa alguns caracteres a mais e paga duas coisas: capacidade
nova não exige editar `alias.config.ts` nem `tsconfig.json`, e cada import diz a
camada em voz alta no lugar de uso.

### A regra de dependência

1. `capabilities/` importa `shared/` e nada mais. **Nunca** `modules/` ou `app/`.
2. `modules/<x>` importa uma capacidade só pelas entradas públicas dela
   (`@capabilities/whiteboard`, `@capabilities/whiteboard/dom`).
3. `modules/analyse` consome `modules/daily-log` só pelo `index.ts` público.
   Por consequência **`Entry`, `Label` e `EntryRepository` são domain do
   daily-log**, não de um `domain/` global — é aí que "cada módulo com seu
   domain" deixa de ser pasta bonita e passa a ser testado.
4. Nenhum módulo importa de `app/`. A seta só aponta para baixo.

A regra é executável: `app/src/architecture.test.ts` varre o source
e falha nomeando arquivo e especificador. Inclui a invariante "`capabilities/whiteboard/core`
é DOM-free", que antes era só uma frase no README.

### Duas superfícies públicas para o whiteboard

`@capabilities/whiteboard` exporta o core (livre de DOM);
`@capabilities/whiteboard/dom` exporta o
adapter. Separadas para que um consumidor que traga o próprio renderer não puxe
DOM para o bundle — é a propriedade que permite trocar de framework mexendo só
no adapter.

### Composição por flag de build

Cada módulo entra no manifest (`app/modules.ts`); a shell lê o manifest e não
conhece módulo nenhum pelo nome. A flag é comparação estática contra literal:

```ts
...(import.meta.env.VITE_ANALYSE === 'true' ? [ { …, load: () => import('@modules/analyse') } ] : [])
```

A forma importa. O vite só dobra comparação estática — `VITE_MODULES.includes('analyse')`
é operação de string em runtime e sobrevive no bundle. E o `import()` precisa
estar **dentro** do ramo que dobra, senão o chunk é emitido mesmo com a flag
desligada. Verificado com dois builds: `analyse-*.js` só existe com a flag on.

O whiteboard já tem seu próprio mecanismo de composição, em outro grão —
`BlockRegistry` e `RendererRegistry`. Composição de blocos é lá; de módulos, no
manifest. Não confundir os níveis.

### Pacote único, não pnpm workspace

Com zero dependências de runtime e ~1.600 linhas, workspace compra só fronteira
de import — que path alias + teste de arquitetura entregam mais barato, sem
`package.json` por módulo nem versionamento interno.

**Gatilho para graduar** o whiteboard a pacote próprio: um consumidor fora do
dailly, ou cadência de release separada. Enquanto não houver nenhum dos dois,
workspace é cerimônia.

### Vite geral, duas entradas

`root: 'src'`, com `src/index.html` (app) e `src/playground/index.html`
(harness). O playground sobrevive porque é onde comportamento real de browser do
whiteboard se confere a olho — o README já apontava `make dev` para lá. No Vite
8 as entradas vão no `input` de topo, não em `build.rollupOptions`.

## Consequências

**Positivas**

- Cada módulo de produto ganha seu domain sem que o whiteboard saiba disso.
- Um módulo não pronto não entra no bundle: dá para shipar antes da Fase 4/5.
- O layout é **neutro** às duas decisões abertas — cada módulo tem seu próprio
  `ui/`, e o contrato de montagem vive isolado em `shared/dom-shell.ts`, que é
  o arquivo que morre se a UI virar React.
- A fronteira falha em CI, não em code review.

**Negativas / trade-offs**

- Mais indireção para quem só quer mexer no whiteboard: agora há alias,
  manifest e duas superfícies onde antes havia `src/core`.
- O rename `ui/` → `app/` quebra qualquer caminho externo que apontasse para lá.
  Barato agora (o diretório tinha um commit); caro depois.
- Flag de build exige rebuild para alternar módulo. Aceito: enquanto Analyse
  não existe, o valor está em *remover* o código, não em alternar.
- `@types/node` entra como devDependency (os configs resolvem caminho). A
  propriedade "zero dependências de **runtime**" segue intacta.
- `shared/dom-shell.ts` admite um tipo de DOM em `shared/`, que deixa de ser
  totalmente neutro. Isolado num arquivo próprio justamente para ser
  descartável; a neutralidade que importa (`capabilities/whiteboard/core`) é testada.

## Alternativas consideradas

- **pnpm workspace com um pacote por módulo** — a fronteira sairia do teste para
  o resolver. Rejeitado pelo tamanho: custo de `package.json` e versionamento
  interno hoje, sem consumidor externo. Com gatilho explícito para revisitar.
- **Um `domain/` global com `Entry` dentro** — o caminho natural e o que
  dissolve a modularidade de volta num monólito com pastas. `Entry` é material
  do Daily Log; o Analyse o consome pela superfície pública, como a ADR 0001
  descreve.
- **Flag de runtime** (`VITE_MODULES` lido e filtrado em runtime) — alternaria
  sem rebuild, mas carregaria todo módulo em todo bundle e não dobraria no
  vite. Rejeitado enquanto o objetivo for não shipar módulo pela metade.
- **Manter o whiteboard como um módulo entre os outros** — mais simples de
  escrever, e o atalho que quebra o seam de markdown. Rejeitado.
- **`components/` como nome da categoria** — é o palpite natural e está errado:
  componente é widget (recebe props, desenha, morre), enquanto o centro de
  gravidade do whiteboard é o modelo e o DOM é adapter opcional. Pior, é colisão
  marcada: se a §1 cair para React + shadcn/ui, vai existir um `components/` de
  verdade, e 1.600 linhas de parser ficariam na mesma pasta que um `Button`.
- **`lib/`** — convenção universal e mais curta, mas não diz critério de
  entrada, então atrai utilitário solto e vira um segundo `shared/`. Rejeitado
  em favor de um nome que carrega a regra.
- **`packages/`** — sinalizaria a graduação para workspace sem mover arquivo.
  Rejeitado porque hoje seria mentira: não há `package.json` nenhum ali dentro.
- **Reescrever o adapter DOM agora em React** — é a decisão §1, que esta ADR
  deliberadamente não toma. O layout só garante que tomá-la depois não exija
  remexer no core.
