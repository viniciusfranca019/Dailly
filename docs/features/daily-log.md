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

- **Corrigir (Fase 2, F1, card #33):** clicar num registro da timeline (ou Tab e Enter)
  o abre no mesmo editor, com o corpo e o dia dele. "Salvar" ou Ctrl+S grava a correção,
  "Cancelar edição" volta para um registro novo sem gravar, e "Apagar" pede confirmação
  antes de tirar o registro da timeline.
- Trocar o dia no calendário move o registro para o dia novo pela regra do composer: ao
  meio-dia num dia anterior, na hora atual se o dia novo é hoje. Sem trocar o dia, o
  registro guarda a hora que tinha, e abrir e salvar sem mudar nada não grava nada.
- Clicar noutro registro com texto não salvo no editor não o descarta: a tela pede para
  salvar ou cancelar antes.
- Corpo apagado por inteiro é recusado com "o corpo da entrada é obrigatório". Se a API
  falha, a correção continua no editor. Se o registro foi apagado em outra aba, salvar ou
  apagar diz "registro não encontrado", volta para um registro novo e relê a timeline.

- **Labels (Fase 2, F2, card #34):** abaixo do editor, o campo "+ label" sugere as labels
  que existem; Enter aplica a que tem o nome digitado, sem diferenciar maiúsculas, ou cria
  uma nova com a próxima cor da paleta. O × tira a label do registro. As labels aparecem
  na timeline com a cor delas.
- "Gerenciar labels", abaixo do editor, renomeia, troca a cor (azul, verde, amarelo,
  laranja, vermelho, roxo, rosa, cinza) e apaga uma label com confirmação. Apagar tira a
  label de todo registro e não apaga registro nenhum.

- **Propriedades (Fase 2, F3, card #35):** abaixo das labels, "+ propriedade" sugere as
  chaves que existem com o tipo ("humor · texto"). Uma chave nova pede o tipo uma vez
  (texto, número ou sim/não), e ele vale dali em diante. O valor é conferido pelo tipo
  ("horas espera um número"), e o registro mostra "humor: bom" na timeline. O × tira a
  propriedade do registro; a chave continua sugerida.

- **Filtrar (Fase 2, F4, card #36):** acima da timeline, as labels viram botões; ligar
  uma mostra só os registros com ela, ligar outra soma (OU). "propriedade… valor Filtrar"
  restringe (E): "humor = bom" mostra só os que têm humor bom, dentre os das labels
  ligadas. "Limpar filtro" volta a timeline inteira; sem nenhum registro, a timeline diz
  "nenhum registro com esse filtro" com o mesmo botão.

# Regras

- Os use-cases (`createEntry`, `queryEntries`, `updateEntry`, `deleteEntry`) rodam no renderer; o servidor guarda a
  `Entry` pronta, sem gerar id nem carimbar.
- O corpo é normalizado uma vez, na criação, e por isso abrir e salvar sem editar não
  muda nada.
- `occurredAt` é o instante atual quando a entrada é de hoje, e o **meio-dia** do dia
  escolhido, no fuso, quando é de um dia anterior.
- Corrigir mantém o id e a data de criação e carimba a de atualização. O corpo corrigido
  é normalizado como o de um registro novo.
- `GET`, `PATCH` e `DELETE /entries/:id` só alcançam registros do dia: a Entry de uma
  tarefa responde 404, porque a tarefa se edita no Tasks e apagar a Entry dela levaria a
  tarefa junto.
- Uma label é global, a mesma para registros e tarefas (o Tasks v2 vai usá-las), com nome
  único sem diferenciar maiúsculas, inclusive as acentuadas ("Saúde" e "SAÚDE" colidem;
  "saúde" e "saude" são duas labels), pela `labels.name_key`, a chave que o domínio
  calcula, e uma cor da paleta. Fica no módulo entries: `GET`, `POST`, `PATCH` e
  `DELETE /labels`, e a migration 6 (`labels`, `entry_labels`, com cascade dos dois lados).
- Um registro com uma label que não existe é 400 nomeando `labelIds`.
- O valor de uma propriedade fica em `entries.props` (JSON); o tipo de cada chave, em
  `property_defs` (migration 7), criada no primeiro uso por `POST /property-defs` e
  imutável (409 se a chave já tem tipo). `POST` e `PATCH /entries` recusam com 400 uma
  chave sem tipo ou um valor fora do tipo.
- `GET /entries?labelIds=a,b&props[humor]=bom` combina labels por OU e propriedades e
  período por E (RN4). O valor da propriedade é lido pelo tipo da chave ("7,5", "sim"); chave
  sem tipo ou valor fora dele é 400.
- Um fuso só: `DAILLY_TZ` do processo da API (padrão UTC); um fuso inválido derruba o
  boot com mensagem. Todo "que dia é este instante" passa por `@dailly/periods`.

# Onde mora

- `ui/src/modules/daily-log/` (`DailyLog.vue`, `Composer.vue`, `Timeline.vue`),
  `ui/src/adapters/http-entry-repository.ts`
- `server/src/modules/entries/` (as rotas e o `sqlite-entry-repository.ts`, construído no `provide` do módulo)
- `packages/domain/src/` (`create-entry.ts`, `query-entries.ts`, `update-entry.ts`,
  `delete-entry.ts`, `entry-repository.ts`),
  `packages/periods/src/`
- `e2e/entries-round-trip.test.ts` põe as duas metades da port uma contra a outra.

# Entregue

Fase 1, em commits diretos na `main` de 2026-09-16 e 2026-09-17, antes dos PRs. Sempre
ligado, sem flag.

# Limites

- O filtro não fica salvo nem na URL: recarregar volta a timeline inteira.
- Uma chave de propriedade não se renomeia, não se apaga e não troca de tipo.
- Corrige só o dia, não a hora exata, e não guarda histórico de edições.
- A API aceita `GET /entries?from&to`, mas nenhuma tela filtra por período ainda.
- A timeline mostra só o título; o markdown do corpo não é renderizado na leitura.
