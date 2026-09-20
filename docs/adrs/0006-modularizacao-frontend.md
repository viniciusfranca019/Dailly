# ADR 0006 — Modularização do frontend

- **Status:** Aceito · duas decisões **superseded**:
  - os nomes de diretório (`app/`, `src/app/`, alias `@app`) →
    [ADR 0009](0009-topologia-do-workspace.md)
  - a decisão "pacote único" foi **superseded** pela
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

## Emendas

### Emenda 1 (2026-09-20) — a previsão do `dom-shell.ts` se cumpriu

Esta ADR chamou `shared/dom-shell.ts` de *"o arquivo que morre se a UI virar
React"*, e o isolou num arquivo próprio justamente para ser descartável. A UI
não virou React — virou Vue ([ADR 0010](0010-vue-no-renderer.md)) — e o arquivo
morreu assim mesmo, substituído por `shared/vue-module.ts` na
[Emenda 2 da ADR 0010](0010-vue-no-renderer.md#emenda-2-2026-09-20--o-módulo-passa-a-ser-um-componente).

**A separação que esta ADR fez é o que tornou a troca barata**, e vale registrar
porque é raro um trade-off se pagar de forma tão direta: `module.ts` — manifesto,
flags, `load()` preguiçoso — atravessou sem uma linha alterada, porque ele nunca
soube como um módulo é desenhado. Só a metade que sabia foi trocada.

O custo listado acima — "admite um tipo de DOM em `shared/`, que deixa de ser
totalmente neutro" — **não deixou de existir: foi trocado**, e a primeira
redação desta emenda dizia o contrário. O contrato novo não menciona
`HTMLElement`, é verdade, mas importa `type { Component } from 'vue'`. Um tipo
de plataforma virou um tipo de framework, o que é discutivelmente o acoplamento
mais apertado dos dois — DOM existe em qualquer renderer, Vue não.

O que atenua, dito para não virar a correção oposta: nada sob `capabilities/`
importa `@shared`, então o tipo do Vue alcança só o shell e os SFCs, e é
`type`-only, portanto apagado no build. E a troca está registrada como decisão
na [ADR 0010, Emenda 2](0010-vue-no-renderer.md) — *"um módulo não-Vue deixa de
ser possível sem mudar o contrato de novo"*. O defeito aqui era de redação, não
de decisão: uma conclusão com a causa errada pendurada.

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

## Emendas

### Emenda 1 (2026-09-20) — a mesma decisão, aplicada ao servidor

Esta ADR decidiu a modularização de um lado só, porque quando ela foi escrita
só existia um lado. A [ADR 0009](0009-topologia-do-workspace.md) criou o
`server/`, e ele nasceu plano: oito arquivos na raiz de `src/`, com as rotas do
Daily Log, o runner de migrations e o composition root no mesmo nível.

Plano funcionava com um módulo. O gatilho para deixar de funcionar é o módulo
**Requests** ([ADR 0011](0011-requests-modulo-e-execucao.md)), que traz rotas,
schema e um adapter próprios — e que, sem fronteira declarada, entraria por
import direto em `app.ts` exatamente como esta ADR descreve que o atalho
acontece.

A forma é a desta ADR, com os nomes da 0009:

```
server/src/
  shell/        config · database · runner de migrations · buildApp · /health
  modules.ts    o manifest
  modules/
    entries/    routes · validate · migrations · index
  adapters/     sqlite-entry-repository — implementa port de pacote, não de módulo
  index.ts      composition root
```

**Duas diferenças em relação ao frontend, e as duas têm causa.**

**Não há flag de build.** Na `ui/` a flag existe para *remover* código de um
bundle que o usuário baixa, e a forma dela (`=== 'true'`, com o `import()`
dentro do ramo) é ditada pelo que o vite dobra. No servidor não há bundle: uma
rota desligada não custa bytes a ninguém. Uma flag de runtime aqui compraria a
única divergência que interessa evitar — um renderer sem o módulo conversando
com uma API que o tem, ou o contrário.

**As migrations são a tensão de verdade.** `PRAGMA user_version` é um inteiro
por arquivo, não por módulo: não existe "versão do entries" e "versão do
requests", existe *a* versão do banco. Então os números são globais mesmo
quando o código que os declara é local, e nada no tipo impede dois módulos de
escolherem o mesmo.

A decisão: cada módulo declara sua fatia, o shell concatena e ordena, e
`collectMigrations` recusa colisão nomeando a versão e os dois módulos. A
coordenação dos números é manual; a asserção é o que a torna segura. E ela roda
**antes** de o arquivo ser aberto — um manifest inconsistente derruba o boot sem
ter escrito nada, porque um boot que falha depois de aplicar metade do schema é
pior que um que não sobe.

A alternativa era uma tabela própria de controle, com versão por módulo. Ela
resolveria a coordenação manual, e custaria abandonar o `user_version` — que é
exatamente a propriedade de que a [ADR 0005](0005-backup-restore.md) depende:
restaurar um `.sqlite` antigo e abri-lo roda as migrations que faltam sem
contabilidade externa nenhuma. Coordenar à mão e falhar alto é o lado barato
desse par.

### O adapter fica fora dos módulos — e o que isso deixa descoberto

`sqliteEntryRepository` implementa `EntryRepository`, que é port do **pacote**
`@dailly/domain`, não do módulo entries. É a mesma razão pela qual o
`http-entry-repository.ts` da `ui/` mora em `ui/src/adapters/` e não dentro de
um módulo. Ele vai para `server/src/adapters/`.

A causa imediata é a regra: com o adapter dentro do módulo, o composition root
precisava importar `modules/entries/index.js` **pelo nome** para montar o saco
de dependências, e a fronteira ficava escopada em `shell/` — isentando o único
arquivo que fazia o que ela proíbe. Fora de `modules/`, agora, só o `modules.ts`
importa de `modules/`, e a regra vale para a árvore inteira.

**O que essa mudança não conserta, dito aqui porque o próximo leitor não deve
supor que consertou.**

**A terceira divergência em relação ao gêmeo, e a única que não é deliberada —
é adiada.** O `ModuleDescriptor` da `ui/` é genérico (`ModuleDescriptor<TModule>`):
ele não conhece tipo de produto nenhum. O `ServerModuleDeps` nomeia `entries:
EntryRepository`, que é tipo de produto. O contrato do shell, aqui, ganha um
campo por módulo.

O custo é o tell da Lei 4: trazer o Requests obriga a editar este arquivo, que
já funciona. E o acoplamento tem um lugar exato — `createServer` constrói o
`sqliteEntryRepository` incondicionalmente, fora do laço do manifest, então o
parâmetro `modules` **não determina sozinho a composição**: ele pressupõe que o
manifest traga o módulo entries. Violada a pressuposição, quem reclama é o
SQLite (`no such table: entries`), não o contrato.

A saída é conhecida, não é pesquisa: um `provide(db, zone)` opcional no
`ServerModule`, chamado pelo composition root e fundido ao saco — verificado
como compatível com os testes que o C2 congelou. Ela não foi construída porque
hoje teria **um chamador só**, que é exatamente a abstração que a Lei 3 proíbe.
Adiar aqui não é adiar o pensamento: a forma já está escrita.

**Gatilho para graduar**, no mesmo idioma que esta ADR usa para o workspace: o
módulo Requests da [ADR 0011](0011-requests-modulo-e-execucao.md) é o segundo
chamador, e é ele que paga a abstração. Construir lá, não antes.

**E a propriedade nova, que a `ui/` não tem.** O adapter da `ui/` implementa um
port de domínio sobre um *transporte*; ele não conhece o interior de módulo
nenhum. O do servidor implementa um port de domínio sobre o **schema privado de
outro módulo** — a tabela `entries`, criada por `modules/entries/migrations.ts`.
Depois da mudança, a tabela e o código que a lê moram em camadas diferentes.

O ponto que decide o registro: **esse acoplamento não carrega import nenhum.**
Ele é um nome de tabela, uma string. O teste de fronteira julga o grafo de
imports, então ele não vê isso hoje e não vai ver nunca — não é dívida a cercar
depois, é uma propriedade a conhecer.

O que sobra segurando é teste, não regra: o teste do adapter usa `openDatabase`,
que roda as migrations coletadas do manifest, então perder a tabela derruba o
teste. A guarda é estreita e vale enunciar o tamanho dela: pega perda, não
deriva — uma migration futura que renomeie uma coluna que o adapter não lê não
dispara nada; acopla ao *manifest*, não ao módulo; e quem edita a migration vê
um teste de *adapter* ficar vermelho, então vai razoavelmente consertar o
adapter.

Um reforço que não foi projetado e vale manter: a mitigação só existe enquanto
esse teste usa a lista default do `openDatabase`. Passar `ENTRIES_MIGRATIONS`
explicitamente exigiria importar de `modules/entries/`, que a regra nova proíbe
de fora. A regra empurra o teste de volta para a forma que preserva o
acoplamento — é isso que torna a garantia durável em vez de acidental.

**A fronteira ganhou o teste que esta ADR exige dela**, em
`server/src/architecture.test.ts`: o shell conhece o manifest e nunca um
módulo; um módulo só alcança fora de si o contrato do shell e o index público
de outro módulo.

Essa segunda regra é **lista branca**, e chegou nessa forma por duas falhas.
O primeiro predicado era regex sobre o texto do import, e um irmão alcançado
por `../entries/validate.js` atravessa a fronteira sem conter a palavra
`modules` — resolver o caminho antes de julgar é o que vê isso. O segundo
nomeava o proibido (`shell/`, fora do contrato), e foi furado por um `../` a
mais: o composition root reexporta `openDatabase`, `migrate` e `MIGRATIONS`,
então o interior do shell seguia alcançável por uma porta que a regra não
nomeava — e por ali toda aresta é import de **valor**, o que mata o boot de
verdade com `MODULES` ainda indefinido, acusando no stack o `shell/migrations.ts`,
que é a vítima. Lista de proibidos envelhece a cada arquivo novo; lista branca
não, porque o que um módulo legitimamente alcança são três coisas e elas não
crescem.

**O que não mudou, de propósito:** `desktop/`. É um arquivo, a execução das
requests mora no servidor, e nenhum IPC novo nasce disto.
