# Changelog

Toda versão do dailly, a mais nova primeiro. O número é o `VERSION` da raiz, a
única fonte dele; quando subir MAJOR, MINOR ou PATCH está em
[`docs/conventions/versioning.md`](docs/conventions/versioning.md). O que cada
feature faz está em [`docs/features/`](docs/features/index.md).

## 0.1.0 — 2026-11-02

A primeira versão numerada: tudo o que o dailly fazia até aqui, reunido num
número só. Antes dela o repo não tinha versão.

- **Daily Log, Fase 1.** Escrever uma entrada em markdown no editor de blocos e
  vê-la na timeline agrupada por dia, no fuso de `DAILLY_TZ`.
- **Editor de blocos.** O whiteboard estilo Notion: markdown entra, markdown
  sai, com seleção de blocos por Shift, mover e indentar.
- **Requests: colar um curl** importa a requisição num navegador de verdade, e
  URL inválida é recusada com 422 (#8).
- **Requests: o executor é escolhido pelo protocolo.** Driver e executor num
  `Protocol` só, para gRPC e AMQP entrarem como mais um item (#9).
- **Só web, só nesta máquina.** O desktop Electron sai; `make start` sobe o app
  com o diário de verdade, e a API aceita só `Host` e `Origin` desta máquina (#10).
- **Requests: a coleção como no Apidog.** Pastas, menu ⋯, clique direito,
  arrastar, renomear e apagar recursivo com confirmação (#11).
- **Cofre de segredos.** Valores cifrados com AES-256-GCM no SQLite, abertos
  pela senha da sessão junto do `DAILLY_SECRET_KEY` do `.env`, com chave de
  recuperação (#13, #14), e a tela de destravar, mascarar e revelar (#16).
- **Colar curl com credencial** manda a chave ao cofre e deixa `{{nome}}` na
  request, escapado quando está numa string de corpo JSON (#17).
- Dívida: o `ModuleDeps` da UI partido, o `ExecutedResponse` no
  `@dailly/requests-core/http` e o id do Requests vindo da raiz (#12).
