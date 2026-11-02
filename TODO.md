# Pendências

**Este arquivo é um índice, não uma fonte de verdade.** O raciocínio de cada
item mora na decisão que o tomou, em
[`docs/conventions/architecture.md`](docs/conventions/architecture.md), achável
pelo número da antiga ADR; aqui ficam só o nome, o gatilho e o link. Se os dois
divergirem, a decisão ganha, e o item aqui está errado.

Aqui está o que foi decidido e **não** foi feito, e a ordem das fases que
faltam. O que já foi feito está em [`docs/features/`](docs/features/index.md).

---

## Fases por vir

Fatia vertical primeiro, largura depois: cada fase entrega algo observável de
ponta a ponta.

- [ ] **Fase 2: Daily Log completo.** Labels, propriedades (tipadas em
      `property_defs` ou ad-hoc na coluna `props`), editar e apagar entrada, e
      filtros na timeline combinando label e propriedade. Pronta quando uma
      entrada com label e propriedade é criada, editada, apagada, e recuperada
      pelo filtro certo.
- [ ] **Fase 3: Settings e BYOK.** Escolher o provider de IA, salvar a chave no
      cofre e validar que ela funciona. Não depende da Fase 2.
- [ ] **Fase 4: núcleo do Analyse.** `Materialization`, o Processor e
      `runAnalysis`, ponta a ponta com um `Summarizer` fake. Depende das Fases 2 e 3.
- [ ] **Fase 5: UI do Analyse.** Período, filtros, resultado e histórico.
      Depende da Fase 4.
- [ ] **Fase 6: acabamento.** Estados de carregando, vazio e erro em todas as
      telas, que só existem por inteiro depois das Fases 2 e 5.

## Deferido, com o gatilho escrito

- [ ] **`vue-tsc` rodando** — **nenhuma linha de SFC é typechecada hoje**, nem
      template nem `<script setup>`: o shim `declare module '*.vue'` resolve o
      arquivo inteiro para um `DefineComponent` opaco. O bloqueio é externo —
      vue-tsc 3.3 carrega `typescript/lib/tsc`, que o TypeScript 7 nativo não
      exporta mais. Enquanto isso, as props dos componentes são garantidas por
      teste e por nada mais.
      → [ADR 0010](docs/conventions/architecture.md)
- [ ] **Biblioteca de componentes** para as telas de formulário — decidir quando
      a primeira existir, não antes. → ADR 0010
- [ ] **Store de estado** (Pinia ou nada) — decidir quando houver estado
      compartilhado entre telas. → ADR 0010
- [ ] **Testing Library para Vue** em vez do harness DOM cru → ADR 0010
- [ ] **O token sem quem o gere** — o servidor ainda aceita um, e nada no app o
      produz desde que o desktop saiu. Fica para um modo hospedado; se ele não
      vier, remover. → [ADR 0012](docs/conventions/architecture.md)
- [ ] **Excluir `PropertyDef`, reexecutar análise do mesmo período, e combinar
      `EntryFilter` entre dimensões** → ADR 0007, ainda em aberto

## Requests — fora do corte, de propósito

Escrito para não ser lido como esquecimento. Cada um tem o motivo de não ter
entrado, e nenhum deles bloqueia o uso do módulo.

- [ ] **Histórico de execução** — outro schema, e a ADR 0011 decidiu que a
      resposta vive enquanto a tela a mostra.
- [ ] **Aba Params editável** — hoje só-leitura. Torná-la editável exige o
      `savedOf` saber serializar a query de volta, e a query fica **fora** da
      URL até o `toWire` de propósito (colar antes exigiria escolher entre `?` e
      `&` olhando um texto que pode ser `{{baseUrl}}`).
- [ ] **Cancelar uma execução** — exige um `AbortController` indexado por id de
      execução, com estado vivo no servidor. → [ADR 0011](docs/conventions/architecture.md)
- [ ] **Resposta em streaming** (SSE, chunked) — exige streaming do Fastify de
      volta ao renderer. → ADR 0011
- [ ] **Busca por conteúdo de request** — vira scan, porque o `spec` é JSON
      opaco para o SQL. Preço nenhum numa coleção pessoal; a revisitar se virar
      milhares. → ADR 0011

## Limites conhecidos — não são bugs, e a tela os diz

- **Brotli não abre.** Nenhum navegador expõe `br` por `DecompressionStream`, e
  o copy-as-cURL do Firefox manda `Accept-Encoding: gzip, deflate, br` — então
  `br` chega. A tela diz que chegou comprimido num formato que não abre, em vez
  de decodificar como texto e encher a tela de U+FFFD. Abrir custaria um wasm de
  terceiro no renderer. → [ADR 0011, Emenda 1](docs/conventions/architecture.md)
- **`deflate` cru, sem envelope zlib, não abre.** `DecompressionStream` é
  estrito onde os navegadores são tolerantes. É bug de servidor; um fallback
  para `deflate-raw` cobriria em três linhas, e fica escrito aqui porque
  ninguém esbarrou nele ainda.
- **A expansão para em 16 MB.** O servidor corta em 5 MB o que chega pela rede;
  comprimido, isso vira gigabytes ao expandir, e o renderer não segura. Para,
  marca, e a marca diz que foi esta tela que cortou — não o servidor, não o
  prazo.
