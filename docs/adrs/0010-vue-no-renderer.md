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
