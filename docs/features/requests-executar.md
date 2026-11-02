---
type: Feature
title: Executar uma request
description: Enviar executa a request no servidor, pelo executor do protocolo dela, e a tela mostra status, headers, corpo e o motivo de cada falha.
tags: [requests, execucao, protocolo]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- "Enviar" **grava a request antes** e o servidor executa o que está guardado, então o
  que está na tela é o que sai.
- A caixa "Variáveis" recebe `NOME=valor`, uma por linha; ela continua preenchida ao
  trocar de request.
- A resposta mostra status, duração, tamanho, headers e corpo. `gzip` e `deflate` abrem
  na tela; `br` é dito ("respondeu comprimido em br, N bytes"), e um corpo binário
  também, sem virar U+FFFD.
- Marcas na resposta: truncado (5 MB no servidor), prazo estourado no meio do corpo, e
  expansão cortada na tela (16 MB).
- Cada falha diz onde procurar: variável sem valor (nada saiu para a rede), API local
  fora, recusa antes de abrir conexão (422), alvo inalcançável (502), prazo (504).
- Clique duplo não executa duas vezes; trocar de request no meio descarta a resposta
  velha.

# Regras

- A execução mora só no servidor; a metade pura (validar, resolver, montar) é do
  `requests-core`, que não executa.
- Um protocolo é um `Protocol = { driver, execute }` em `PROTOCOLS` (hoje só `http`),
  escolhido pela chave `protocol`. gRPC ou AMQP entram como mais um item, sem tocar nas
  rotas nem no schema. Protocolo não registrado é 422.
- A ordem: ler a request guardada, validar o `env`, `resolve` (o `env` da tela vale
  primeiro e o [cofre](/features/cofre-de-segredos.md) preenche o resto), validar,
  executar com undici.
- Status de `POST /requests/:id/execute`: 400 `env` malformado ou variável sem valor;
  404 request inexistente; 422 spec inválido, protocolo desconhecido ou URL ilegível; 423
  variável que só o cofre tem, com ele trancado; 502 alvo inalcançável; 504 prazo de 30 s.
- Uma variável sem valor nunca vai para a rede como `{{token}}`, e um valor do cofre
  nunca aparece numa mensagem de erro.
- O servidor não descomprime: devolve os bytes, e a tela decide (`decodeBody`).

# Onde mora

- `server/src/modules/requests/` (`routes.ts`, `protocols.ts`, `execute.ts`)
- `packages/requests-core/src/` (`protocol.ts`, `registry.ts`, `resolve.ts`,
  `http/executed.ts`)
- `ui/src/modules/requests/model/` (`env.ts`, `decode.ts`),
  `ui/src/modules/requests/ui/response/ResponseView.vue`

# Entregue

A base em commits diretos de 2026-09-20; o executor por protocolo no #9, o
`ExecutedResponse` único no `requests-core` no #12, e o cofre na execução no #14. Atrás
de `VITE_REQUESTS=true`.

# Limites

- Sem histórico de execução: a resposta vive enquanto a tela a mostra.
- Sem cancelar nem streaming; `br` e `deflate` cru não abrem.
- A tela, a forma da resposta e os erros 422, 502 e 504 ainda são só de HTTP.
