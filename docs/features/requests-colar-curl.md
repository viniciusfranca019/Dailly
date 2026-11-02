---
type: Feature
title: Colar um curl
description: Colar um curl na barra de URL do Requests preenche a requisição inteira, e o que não foi aplicado é dito em vez de calado.
tags: [requests, curl, importar]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- Colar um `curl …` (como o DevTools copia) na barra de URL preenche método, URL,
  headers, corpo, a query do `-G` e a auth do `-u`.
- O editor tem método, URL e "Enviar" numa linha, e as abas Params (só leitura),
  Headers, Body e Auth.
- Flag que não foi aplicada aparece em "não apliquei: <flags>".
- Curl ilegível diz o motivo (não começa com `curl`, sem URL, URL ambígua, aspas sem
  fechar) e o texto fica no campo para corrigir.
- Digitar um curl letra a letra não importa nada: só um salto de mais de um caractere
  que comece com `curl ` dispara a importação.
- Colar outro curl troca o conteúdo da request, mas mantém o nome e a pasta.
- Uma URL que nem é URL é recusada com 422 na execução, e não vira 502.
- Um curl com credencial literal passa antes pelo
  [form do cofre](/features/requests-colar-credencial.md).

# Regras

- Sem `-X`, `-d` implica POST e `-I` implica HEAD; `-G` leva os dados para a query.
  Vários `-d` se juntam com `&`; `--data-urlencode` segue a regra do curl.
- `-A`, `-e` e `-b k=v` viram User-Agent, Referer e Cookie; `-u` corta no primeiro `:`
  fora de `{{…}}`.
- `--cert`, `--proxy`, `--max-time`, `-F` e afins são ignorados inteiros e relatados;
  qualquer outra flag desconhecida também é relatada.
- A importação é pura, no renderer (`fromRaw`, em `@dailly/requests-core/http`).
- O colar é detectado por **um listener só**, que mede o salto contra o modelo antes de
  gravar. Com `v-model`, `@input` e `watch` juntos, o navegador rodava microtasks entre
  eles e o salto dava zero. Foram descartados `@paste` (não se testa no jsdom) e
  `watch` com `flush: 'sync'` (duas verdades acopladas por timing).

# Onde mora

- `packages/requests-core/src/http/` (`from-raw.ts`, `tokenize.ts`)
- `ui/src/modules/requests/model/draft.ts` (`importCurl`),
  `ui/src/modules/requests/ui/editor/RequestEditor.vue`

# Entregue

A base veio em commits diretos de 2026-09-20; o colar num navegador de verdade e o 422
de URL ilegível, no #8. Atrás de `VITE_REQUESTS=true` (ligado em `make start` e
`make dev-all`).

# Limites

- A aba Params não é editável; multipart (`-F`) não é suportado.
