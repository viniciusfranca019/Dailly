---
type: Feature
title: Coleção em pastas
description: As requests do Requests organizadas numa árvore de pastas como no Apidog, com menu, arrastar, renomear e apagar recursivo.
tags: [requests, colecao, pastas]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- A árvore fica à direita. Cada pasta mostra seta, nome e quantas requests tem na
  descendência; cada request, o método colorido antes do nome.
- As pastas começam fechadas, e o que está aberto é lembrado ao recarregar. Abrir uma
  request abre o caminho até ela.
- O `⋯` de cada nível e o clique direito oferecem "Nova request", "Nova pasta",
  "Renomear" e "Apagar".
- Arrasta requests e pastas para outra pasta ou para a raiz; só o alvo válido sob o
  ponteiro acende.
- Renomeia no lugar: Enter confirma, Esc cancela, nome vazio é recusado.
- Apagar pede confirmação dizendo quantas requests e subpastas vão junto; se a request
  aberta for embora, o editor fecha.
- Quando o servidor recusa, a árvore fica como estava e diz o porquê.

# Regras

- A coleção é uma árvore (`parentId` + `position`), e nenhuma escrita pode fechar um
  laço: o servidor responde 409, e a tela usa o mesmo `wouldCycle` para não acender um
  alvo que seria recusado.
- **Apagar uma pasta é recursivo**, como no Apidog e no Postman. Foi descartado recusar
  pasta com conteúdo, que obrigaria esvaziar pasta por pasta.
- **Sem movimento otimista:** o estado da árvore chega por `provide`/`inject` e a tela
  relê a coleção depois de toda mudança, porque a árvore é recursiva e reler já é "voltar
  ao que era" quando o servidor recusa. Foram descartados emits encadeados e desfazer à
  mão.
- Mover leva ao rascunho só a pasta, e renomear só o nome, para não sobrescrever o que
  não foi salvo.
- Um spec guardado que não parseia aparece com o aviso de que só dá para apagá-lo.

# Onde mora

- `ui/src/modules/requests/ui/collection/`, `ui/src/modules/requests/model/tree.ts`
- `server/src/modules/requests/` (`routes.ts`, `sqlite-request-store.ts`)
- `packages/requests-core/src/storage/` (`folder.ts`, `request-store.ts` e a suíte de
  contrato)

# Entregue

A base (pastas, salvar, apagar) em commits diretos de 2026-09-20; a árvore do Apidog e o
apagar recursivo no #11, que também consertou o DELETE (todo DELETE do app levava 400).
Atrás de `VITE_REQUESTS=true`.

# Limites

- Não há busca pelo conteúdo das requests: o `spec` é JSON opaco para o SQL.
