# ADR 0010 — Vue no renderer, com o whiteboard como ilha vanilla

- **Status:** Aceito
- **Data:** 2026-09-16
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0003](0003-ui.md) (supersede a stack) ·
  [ADR 0006](0006-modularizacao-frontend.md) · [ADR 0008](0008-electron-como-shell.md)
  · [adaptacao-dailly.md §1](../adaptacao-dailly.md)

## Contexto

A ADR 0003 escolheu **React + Tailwind + shadcn/ui + TanStack Query** em julho,
quando a UI era hipótese: não havia editor, não havia adapter, e o documento
ainda achava que markdown se resolveria com "textarea + render".

Três meses depois o projeto tem um editor de blocos vanilla, testado, com um
workaround de `contenteditable` que a [ADR 0008](0008-electron-como-shell.md)
usou como argumento para fixar o motor de renderização. A `adaptacao-dailly.md`
§1 registrou a contradição e deixou a escolha em aberto com prazo: **decidir
antes da Fase 2**, que é quando as telas de formulário aparecem.

Esta ADR decide, e decide contra a 0003.

## Decisão

**O renderer é Vue 3**, em SFC, com `@vitejs/plugin-vue` na `ui/`. A timeline da
Fase 1 já nasce como componente Vue.

### O whiteboard **não** é reescrito

O adapter DOM continua vanilla e passa a ser montado como **ilha**: o componente
Vue expõe um elemento por `ref`, chama `mountWhiteboard` no `onMounted`, e o Vue
**nunca renderiza dentro daquele elemento**. O contrato é o handle que o adapter
já devolve.

A razão é a mesma que a ADR 0008 usou para escolher o shell: o editor depende de
comportamento de `contenteditable`, e há um workaround de `pre-wrap` marcado como
*load-bearing* no CSS. Um vdom reconciliando os nós que o usuário está editando
briga com o caret, e a troca seria feita na superfície mais testada do projeto —
`document.test.ts`, `editing.test.ts`, `whiteboard.test.ts`, `parser/index.test.ts`
— sem nada em troca.

Um editor Vue-nativo continua possível. O gatilho para reconsiderar é concreto:
o dia em que o adapter precisar de estado que só o framework tem.

### O que morre da ADR 0003 e o que sobrevive

**Morre:** React, React Router e **shadcn/ui** — este último não por gosto, mas
porque é acoplado ao ecossistema React, como a própria ADR 0003 registrou nos
trade-offs.

**Sobrevive inteiro:** os princípios. A UI depende só de use-cases e ports, com
injeção pelo composition root; um modelo único de loading/erro/vazio; markdown
como formato de corpo e de materialização; e todo o layout, navegação e escopo
funcional mínimo. Nada disso era sobre React.

### Por que Vue, e por que a comparação com Svelte não foi feita

Decisão do autor. Vue traz SFC, devtools maduro e um modelo de reatividade que
convive bem com uma ilha imperativa — que é exatamente a forma deste projeto.

Svelte seria igualmente defensável, e isso fica registrado em vez de disfarçado:
**nenhuma restrição conhecida deste projeto discrimina os dois.** Investigar a
fundo custaria mais do que a diferença esperada entre as escolhas, e o custo de
trocar depois é o mesmo nos dois casos, porque o que os dois tocam é o adapter —
que a ADR 0006 já isolou atrás de `shared/dom-shell.ts`.

## Consequências

**Positivas**

- A pendência §1 da adaptação fecha antes da Fase 2, como ela pedia, em vez de a
  Fase 1 decidir por acidente construindo uma timeline vanilla.
- O seam que a ADR 0006 construiu (`shared/dom-shell.ts`, cada módulo com seu
  `ui/`) é usado para o que foi desenhado, na primeira vez que importa.
- O core do whiteboard atravessa a mudança **intacto**: ele é
  `@dailly/whiteboard-core` e não conhece DOM nem framework, o que o
  `tsconfig` do pacote agora impõe por compilador.

**Negativas / trade-offs**

- **Acaba o "zero dependências de runtime".** Vale dizer em voz alta que isso
  era estado interino e não princípio — nenhum documento o elevou a restrição.
  Mas é uma propriedade real que o projeto tinha hoje e não terá amanhã.
- **Sem shadcn/ui, formulários e dialogs não vêm de graça.** A ADR 0003 contava
  com eles; a Fase 2 precisa de uma origem para esses componentes. Fica como
  pendência abaixo, não como decisão implícita.
- **Ilha imperativa dentro de framework reativo** é uma costura que exige
  disciplina: o Vue não pode renderizar dentro do host do whiteboard, e isso é
  regra de quem escreve o componente, não algo que o tipo impeça.
- Mais uma reversão de ADR antiga. A 0003 já tinha perdido a decisão de editor
  para o dailly; agora perde a stack. O que sobra dela são os princípios e o
  escopo — que é o que nunca dependeu de framework.

## Pendências

- **Biblioteca de componentes para as telas de formulário** (Fase 2): escrever à
  mão, ou adotar uma do ecossistema Vue. Não decidir agora é de propósito — a
  escolha fica melhor informada quando a primeira tela de formulário existir.
- **Store de estado** (Pinia ou nada): a Fase 1 não tem estado compartilhado
  entre telas. Decidir quando houver, não antes.
- **Testing Library para Vue** em vez do harness DOM cru: os testes atuais do
  adapter não mudam; a pergunta só aparece quando existir componente Vue com
  comportamento próprio.
- **`vue-tsc` rodando** (adicionada em 2026-09-20). Nenhuma linha de SFC é
  typechecada hoje — nem template, nem `<script setup>`. O `env.d.ts` afirmava
  que só o template ficava de fora e isso era falso: o shim `declare module
  '*.vue'` resolve o arquivo inteiro para um `DefineComponent` opaco, e
  `const zzz: number = 'não é número'` dentro de um `<script setup lang="ts">`
  passa no `tsc --noEmit`. O bloqueio é conhecido e não é nosso — vue-tsc 3.3
  carrega `typescript/lib/tsc`, que o TypeScript 7 nativo não exporta mais. A
  pendência fica registrada porque a Emenda 2 levou a exposição de 4 SFCs para
  6, uma delas a moldura de roteamento, e porque "typecheck limpo" vinha sendo
  lido como uma garantia que ele não dá.

## Emendas

### Emenda 1 (2026-09-17) — Tailwind entra; a pendência de componentes continua

A decisão acima matou **React, React Router e shadcn/ui**. Não disse nada sobre
o Tailwind, que na ADR 0003 vinha no mesmo pacote — e a diferença importa: o
shadcn é acoplado ao React, o Tailwind não é acoplado a nada.

Entra o **Tailwind 4**, via `@tailwindcss/vite`, sem arquivo de config (a versão
4 é CSS-first). O gatilho foi um pedido de design escrito inteiro no vocabulário
dele, mas a razão de aceitar é outra: as telas deste produto são dark, densas e
cheias de valores repetidos, e o alternativa era reinventar tokens de espaçamento
e cor à mão em CSS.

**O whiteboard não é tematizado por utilitário.** Ele continua com a própria
folha de estilo e os próprios `var(--wb-*)`; o tema escuro é uma definição
desses tokens em `shell/styles.css`, e o adapter não sabe que o Tailwind existe.
Isso é exatamente o que o docblock daquela folha prometia que os tokens serviam
para fazer.

Um efeito colateral encontrado e corrigido na hora: o *preflight* do Tailwind
zera `font-weight` de `h1`–`h6`, e o negrito dos títulos do whiteboard vinha da
folha padrão do navegador. Passou a ser explícito — um board que promete
renderizar certo numa página nua também precisa sobreviver ao reset do hospedeiro.

**A pendência de biblioteca de componentes continua aberta.** Tailwind não é
uma: não há diálogo, toast nem combobox saindo dele. A Fase 2 ainda vai decidir
entre escrever à mão ou adotar algo do ecossistema Vue.

### Emenda 2 (2026-09-20) — o módulo passa a ser um componente

A decisão acima escolheu Vue e deixou o contrato entre shell e módulo como
estava: `mount(host, deps)` devolvendo um handle. O `shared/dom-shell.ts`
registrou no próprio docblock que sobreviveria à escolha de framework — *"a
module is still handed a host element and still returns a handle"*. Sobreviveu
à escolha, e não sobreviveu ao uso.

**O contrato agora é um componente.** Um módulo exporta `component`; o shell o
renderiza com `<component :is>` e `deps` como única prop. O `dom-shell.ts` some
e dá lugar a `shared/vue-module.ts`.

**A razão é uma só, e não é elegância.** Sob o contrato antigo cada módulo era
um `createApp` próprio. As duas pendências que esta ADR deixou abertas —
biblioteca de componentes para a Fase 2 e store de estado — entram por
`app.use()`, e um plugin instalado na raiz não atravessa fronteira de
aplicação. Com N módulos, ou o plugin era instalado N vezes, ou duas instâncias
de Pinia não compartilhavam estado. Não era custo maior: era a pendência
tornada insolúvel. Agora existe uma aplicação e um ponto de instalação,
`ShellOptions.configure(app)`.

**O que não mudou, e é o ponto.** `ModuleDescriptor`, o manifesto, as flags de
build e o `import()` preguiçoso atravessaram sem uma linha alterada — a ADR
0006 separou "como um módulo é identificado e carregado" de "como ele é
desenhado", e só a segunda metade foi trocada. Build com `VITE_ANALYSE`
desligado continua não emitindo chunk de Analyse.

**O whiteboard não foi tocado.** A decisão principal desta ADR continua de pé
sem emenda: o adapter DOM segue vanilla, montado por `ref` dentro do
`Composer.vue`. A troca de contrato acontece na fronteira de *módulo*, e a ilha
vive dentro de um componente — duas costuras diferentes, e só uma se mexeu.

**Trade-offs assumidos**

- **Um módulo não-Vue deixa de ser possível sem mudar o contrato de novo.** Era
  a única coisa que a neutralidade comprava, e não tinha consumidor: o
  whiteboard é capability dentro de componente, não módulo.
- **`go()` passou a esperar o `nextTick`.** `<component :is>` renderiza no tick
  seguinte, ao contrário do `mount()` síncrono. O await está dentro do `go`
  para que nenhum chamador precise de um `sleep` — mas é uma diferença de
  comportamento real, não só de forma.
- **Refinamento do gatilho de reabertura do whiteboard.** Esta ADR o definiu
  como "o dia em que o adapter precisar de estado que só o framework tem". O
  sintoma concreto já existe em embrião: `currentBlock()` no `Composer.vue`
  consulta `activeElement` e os atributos do board para descobrir onde está o
  caret — Vue enfiando a mão no DOM da ilha. A cura é o handle expor
  `activeBlock()`, **não** o Vue entrar. E quando o gatilho disparar de
  verdade, a saída é Vue *dentro* da ilha: `MountOptions.renderers` já é
  registry, e um renderer pode montar um componente no próprio nó — a forma de
  node view do Tiptap. O gatilho fica mais preciso; a decisão não se inverte.

### Emenda 3 (2026-09-20) — a suíte de arquitetura passa a ler `.vue`

Consequência direta da Emenda 2, registrada porque é uma correção de *alcance
de regra*, não uma limpeza. O `ui/src/architecture.test.ts` varria só `.ts`, e
os quatro SFCs do Daily Log já estavam fora do radar desde a decisão original.
Mover o shell para SFC alargaria o buraco a ponto de a suíte reportar árvore
limpa checando quase nada da UI.

O scan agora inclui `.vue` e extrai o bloco `<script>` — template e style não
importam módulo. O próprio arquivo de teste é excluído do scan, porque ele é o
único que contém especificadores errados de propósito: as fixtures contra as
quais as regras são provadas.

## Alternativas consideradas

- **Manter a ADR 0003 (React + shadcn/ui)** — a única alternativa com biblioteca
  de componentes pronta, que é o trabalho real das Fases 2 e 6. Rejeitada por
  decisão do autor.
- **Svelte** — ver acima: igualmente defensável, sem critério técnico neste
  projeto que separe os dois.
- **Continuar vanilla e decidir na Fase 2** — o que a adaptação previa. Rejeitado
  porque a timeline seria construída duas vezes, e porque chegar na Fase 2 com
  uma timeline vanilla funcionando enviesa a decisão que a Fase 2 deveria tomar
  livre.
- **Reescrever o whiteboard em Vue** — um só paradigma no renderer, sem ilha.
  Rejeitado: mexe na superfície mais testada do projeto, briga com o caret, e a
  ADR 0008 fixou o motor justamente para proteger o workaround que existe ali.
