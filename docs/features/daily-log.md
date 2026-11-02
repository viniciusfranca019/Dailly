---
type: Feature
title: Daily Log
description: Escrever uma entrada em markdown sobre o dia e vê-la na timeline agrupada por dia, no fuso da API; a Fase 1 do módulo.
tags: [daily-log, entries, timeline]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- Em `/`, o card "Registro do Dia" (o [editor de blocos](/features/whiteboard.md)) fica à
  esquerda e o "Histórico de Logs" à direita.
- "Registrar", ou Ctrl+S / Cmd+S em qualquer ponto da janela, grava a entrada; o editor
  esvazia, a timeline é relida e o dia volta para hoje. "Cancelar" esvazia o editor.
- O ícone de calendário registra num dia anterior, com o selo âmbar "registrando em
  <dia>". Dia futuro não se escolhe.
- A timeline agrupa por dia, do mais novo para o mais velho ("Hoje", "Ontem" ou a data
  por extenso). Cada entrada mostra a hora e o título: a primeira linha não vazia, sem
  marcador, ou "sem título".
- "Buscar logs…" filtra por trecho do corpo, sobre o que já foi carregado.
- Estados: carregando, vazio ("nada por aqui ainda"), busca sem resultado, erro.
- O fuso em uso aparece sempre na moldura ("fuso: <zona>"), lido do `GET /health`.
- Corpo vazio depois de normalizar é recusado ("o corpo da entrada é obrigatório"); na
  API, um `POST /entries` inválido é 400 nomeando o campo.

# Regras

- Os use-cases (`createEntry`, `queryEntries`) rodam no renderer; o servidor guarda a
  `Entry` pronta, sem gerar id nem carimbar.
- O corpo é normalizado uma vez, na criação, e por isso abrir e salvar sem editar não
  muda nada.
- `occurredAt` é o instante atual quando a entrada é de hoje, e o **meio-dia** do dia
  escolhido, no fuso, quando é de um dia anterior.
- Um fuso só: `DAILLY_TZ` do processo da API (padrão UTC); um fuso inválido derruba o
  boot com mensagem. Todo "que dia é este instante" passa por `@dailly/periods`.

# Onde mora

- `ui/src/modules/daily-log/` (`DailyLog.vue`, `Composer.vue`, `Timeline.vue`),
  `ui/src/adapters/http-entry-repository.ts`
- `server/src/modules/entries/`, `server/src/adapters/sqlite-entry-repository.ts`
- `packages/domain/src/` (`create-entry.ts`, `query-entries.ts`, `entry-repository.ts`),
  `packages/periods/src/`
- `e2e/entries-round-trip.test.ts` põe as duas metades da port uma contra a outra.

# Entregue

Fase 1, em commits diretos na `main` de 2026-09-16 e 2026-09-17, antes dos PRs. Sempre
ligado, sem flag.

# Limites

- Sem labels, propriedades, edição, exclusão nem filtros: é a Fase 2 (`TODO.md`). As
  rotas que dependem deles respondem 501, e `labelIds` vem sempre vazio.
- A API aceita `GET /entries?from&to`, mas nenhuma tela filtra por período ainda.
- A timeline mostra só o título; o markdown do corpo não é renderizado na leitura.
