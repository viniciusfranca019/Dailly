# Pendências

**Este arquivo é um índice, não uma fonte de verdade.** O raciocínio de cada
item mora na ADR que o decidiu; aqui ficam só o nome, o gatilho e o link. Se os
dois divergirem, a ADR ganha — e o item aqui está errado.

O que **não** está aqui, e a diferença importa porque senão os quatro arquivos
competem:

| | |
|---|---|
| este arquivo | decidido e **não feito** |
| [`docs/auditoria-lacunas.md`](docs/auditoria-lacunas.md) | **não decidido** — leia antes de codar |
| [`docs/roadmap.md`](docs/roadmap.md) | a **ordem** das fases do produto |
| [`docs/mvp.md`](docs/mvp.md) | os **comportamentos** esperados |

---

## Dívida com gatilho já disparado

Estas duas foram contraídas de propósito, com a correção combinada por escrito
antes de o código entrar. O gatilho de cada uma **já aconteceu**.

- [ ] **Partir o `ModuleDeps`** — `ui/src/shared/deps.ts` é um saco único:
      o Daily Log recebe a port de Requests que nunca chama, e o Requests recebe
      os use-cases de Entry que nunca chama. É o mesmo sintoma da Lei 4 que o
      servidor tinha antes do `provide`, do lado da UI. Partir em "o que é de
      todo módulo" (`zone`, `now`) e "o que é deste módulo", como o
      `ProvideContext` fez do outro lado. Mexe em `mount.ts`, `shared/testing.ts`
      e nos testes de composição. **Combinado como a próxima feature.**
      → o custo e a alternativa estão no docblock do próprio arquivo.
- [ ] **Mover `ExecutedResponse` para `@dailly/requests-core/http`** — hoje ele
      existe duas vezes, em `ui/src/shared/requests.ts` e em
      `server/src/modules/requests/execute.ts`, porque a `ui/` não importa o
      `server/`. O adapter valida campo a campo em vez de castar, então a
      divergência aparece como recusa nomeada — mas são duas verdades. Segundo
      chamador já existe. Ficou de fora do B2b para não misturar refactor do
      servidor com PR de tela.
- [ ] **Tirar o `newId()` de `modules/requests/ui/ids.ts`** — ele só existe
      porque acrescentar um campo `ids` ao contrato seria engordar o que a
      primeira pendência vai dividir. Sai junto com ela, e o id passa a vir da
      raiz de composição como o `uuidIds` das entries já vem.

## Deferido, com o gatilho escrito

- [ ] **`vue-tsc` rodando** — **nenhuma linha de SFC é typechecada hoje**, nem
      template nem `<script setup>`: o shim `declare module '*.vue'` resolve o
      arquivo inteiro para um `DefineComponent` opaco. O bloqueio é externo —
      vue-tsc 3.3 carrega `typescript/lib/tsc`, que o TypeScript 7 nativo não
      exporta mais. Enquanto isso, as props dos componentes são garantidas por
      teste e por nada mais.
      → [ADR 0010, Pendências](docs/adrs/0010-vue-no-renderer.md)
- [ ] **Biblioteca de componentes** para as telas de formulário — decidir quando
      a primeira existir, não antes. → ADR 0010
- [ ] **Store de estado** (Pinia ou nada) — decidir quando houver estado
      compartilhado entre telas. → ADR 0010
- [ ] **Testing Library para Vue** em vez do harness DOM cru → ADR 0010
- [ ] **Empacotamento AppImage** — em stand-by por decisão do autor; nada mais
      da Fase 1 depende dele. → [roadmap, Fase 1](docs/roadmap.md)
- [ ] **Excluir `PropertyDef`, reexecutar análise do mesmo período, e combinar
      `EntryFilter` entre dimensões** → [ADR 0007, Pendências](docs/adrs/0007-api-local-e-tempo.md)

## Requests — fora do corte, de propósito

Escrito para não ser lido como esquecimento. Cada um tem o motivo de não ter
entrado, e nenhum deles bloqueia o uso do módulo.

- [ ] **Apagar e renomear pasta** — o servidor não tem a rota. É a que mais
      incomoda: uma pasta criada no lugar errado é permanente pela tela.
- [ ] **Arrastar request entre pastas** — o select de pasta no editor faz o
      mesmo com menos interface.
- [ ] **Histórico de execução** — outro schema, e a ADR 0011 decidiu que a
      resposta vive enquanto a tela a mostra.
- [ ] **Aba Params editável** — hoje só-leitura. Torná-la editável exige o
      `savedOf` saber serializar a query de volta, e a query fica **fora** da
      URL até o `toWire` de propósito (colar antes exigiria escolher entre `?` e
      `&` olhando um texto que pode ser `{{baseUrl}}`).
- [ ] **Cancelar uma execução** — exige um `AbortController` indexado por id de
      execução, com estado vivo no servidor. → [ADR 0011](docs/adrs/0011-requests-modulo-e-execucao.md)
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
  terceiro no renderer. → [ADR 0011, Emenda 1](docs/adrs/0011-requests-modulo-e-execucao.md)
- **`deflate` cru, sem envelope zlib, não abre.** `DecompressionStream` é
  estrito onde os navegadores são tolerantes. É bug de servidor; um fallback
  para `deflate-raw` cobriria em três linhas, e fica escrito aqui porque
  ninguém esbarrou nele ainda.
- **A expansão para em 16 MB.** O servidor corta em 5 MB o que chega pela rede;
  comprimido, isso vira gigabytes ao expandir, e o renderer não segura. Para,
  marca, e a marca diz que foi esta tela que cortou — não o servidor, não o
  prazo.
