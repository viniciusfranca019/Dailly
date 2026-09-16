# Auditoria — o que falta para a documentação sustentar uma implementação fria

- **Data:** 2026-09-15
- **Escopo:** `docs/mvp.md`, `docs/roadmap.md`, `docs/adrs/0001`–`0005`
- **Pergunta respondida:** as decisões e comportamentos estão definidos a ponto de
  alguém que não participou das decisões implementar sem adivinhar?

> **Atualização 2026-09-15:** as lacunas §1.1 (fuso), §1.2 (quadrimestre),
> §1.3 (início da semana) e §1.4 (`occurredAt` vs `createdAt`) foram fechadas
> pela [ADR 0007](adrs/0007-api-local-e-tempo.md). A §2.2 (`SecretStore`)
> muda de forma com a [ADR 0008](adrs/0008-electron-como-shell.md): não há
> plugin de keychain do Tauri, então o mecanismo é outro — decisão da Fase 3.
> O restante segue aberto.

## Veredito

**Não para quem pega frio; sim para quem escreveu.** A base é sólida — camadas,
ports, schema, ordenação de fases e critérios de pronto estão acima da média. As
lacunas são do tipo que o autor não enxerga porque a resposta está na cabeça
dele. Todas as de Nível 1 abaixo são pontos onde um implementador **precisa
escolher** e a escolha muda o que o usuário observa.

O critério usado é o próprio critério de corte do `mvp.md`: *só importa o que um
cliente do domínio observa*.

---

## Nível 1 — Comportamentos indefinidos (bloqueiam a implementação)

### 1.1 Fuso horário — a lacuna mais cara

`ADR 0002` armazena tudo em **UTC** (`ISODateTime`, `occurred_at`). O `mvp.md`
filtra por **dia de calendário** ("período de 2026-07-01 a 2026-07-31"). Nenhum
documento reconcilia os dois.

Consequência observável: uma entrada criada às 21:00 de 31/07 em BRT (UTC−3) é
01/08 em UTC. Ela aparece no filtro de julho ou no de agosto? As duas respostas
são defensáveis e produzem produtos diferentes.

Isto não é um detalhe isolado: **todos os limites de período (semana, mês,
quadrimestre) do Analyse são construídos sobre essa decisão.** Enquanto ela não
existir, o Analyse não tem especificação.

### 1.2 "Quadrimestre" nunca é definido

Aparece em cinco documentos e em um `CHECK` do schema. Em nenhum deles se diz
quais são os limites: jan–abr / mai–ago / set–dez? Ou quadrimestres móveis a
partir de uma data? Um implementador tem que inventar.

### 1.3 Início da semana nunca é definido

Domingo ou segunda? O cenário "Resumo da semana" usa 2026-07-20 a 2026-07-26
(uma semana de segunda a domingo), mas isso é exemplo, não regra declarada.

### 1.4 O Analyse filtra por `occurredAt` ou por `createdAt`?

`Entry` tem os dois. `ADR 0002` diz que `occurredAt` é "quando o fato ocorreu
(default: createdAt)". Nenhum cenário do Analyse diz qual dos dois delimita o
período. Uma entrada escrita hoje sobre um fato do mês passado entra no resumo
deste mês ou do anterior? As duas leituras são plausíveis.

### 1.5 Excluir uma PropertyDef — comportamento ausente

Label tem o cenário explícito: *"Remover uma label não apaga as entradas"*, com
as 3 entradas sobrevivendo. Propriedade não tem equivalente. Ao excluir a
definição "humor", os valores `props.humor` já gravados nas entradas são
apagados, preservados como ad-hoc, ou a exclusão é bloqueada? Assimetria
observável pelo usuário.

### 1.6 Reexecutar a análise do mesmo período

O `mvp.md` cobre disparar e listar o histórico, mas não o segundo disparo para o
mesmo período com o mesmo filtro. Cria uma segunda materialização, substitui a
anterior, ou é bloqueado? O histórico da Fase 5 se comporta diferente em cada
caso.

### 1.7 Semântica de combinação do `EntryFilter`

Está dito que entre labels é **OR**. Não está dito o que acontece entre
*dimensões*: período ∧ labels ∧ propriedades. O implícito é AND, mas implícito
não é especificação — e o cenário "Filtrar por propriedade" só exercita uma
propriedade por vez, então nem o AND entre duas propriedades está coberto.

### 1.8 Renderização de markdown e conteúdo ativo

`ADR 0003` decide markdown como formato do corpo e da materialização. Nenhum
documento diz se HTML embutido no markdown é renderizado ou escapado. O corpo é
escrito pelo próprio usuário (risco baixo), mas **a materialização vem de um LLM
externo** — conteúdo não confiável renderizado na UI. É decisão de segurança
observável, e não está tomada.

---

## Nível 2 — Contratos ausentes

### 2.1 `PropertyDefRepository` não existe

`ADR 0002` define o tipo `PropertyDef` e a tabela `property_defs`; o `roadmap`
lista "CRUD de PropertyDef" como unidade da Fase 2. Mas a ADR declara só
`EntryRepository`, `LabelRepository` e `MaterializationRepository`. Falta a port.

### 2.2 `SecretStore` não existe

`ADR 0004` decide *"a chave vive no keychain do SO (via plugin do Tauri)"*. Isso
é um **adapter ocupando o lugar de uma decisão**: não há port, então o domínio
fica amarrado a um mecanismo de SO. O `mvp.md` repete o vazamento — o cenário de
Settings promete "a chave é guardada com segurança (keychain do SO)", que é
mecanismo, não garantia observável.

Correção: port `SecretStore { set, get, delete }`, com o keychain como um adapter
entre outros; e o cenário do `mvp.md` reescrito para a *garantia* (a chave
sobrevive ao reinício, nunca é persistida em texto plano, nunca aparece no
SQLite).

### 2.3 Já registrados como abertos no próprio roadmap

O `roadmap.md` §"Pontos abertos" já identifica três, e eles continuam válidos —
`Clock` (no diagrama da ADR 0001, nunca definido), `Processor` (descrito só
narrativamente, sem interface) e `StorageProvider` (listado entre os ports de
domínio da ADR 0001 sem marca de pós-MVP, contradizendo a ADR 0005).

---

## Nível 3 — Inconsistências entre documentos

| Onde | Inconsistência |
|---|---|
| `mvp.md` ↔ `ADR 0004` | "keychain do SO" como comportamento observável; deveria ser a garantia do port |
| `ADR 0001` ↔ `ADR 0005` | Diagrama de ports lista `StorageProvider` sem marcá-lo pós-MVP |
| `ADR 0002` ↔ `mvp.md` | Armazenamento UTC vs. filtros por dia de calendário (ver 1.1) |

---

## Proposta de correção

Duas peças, nesta ordem:

1. **ADR 0006 — Semântica de tempo e períodos.** Resolve 1.1 a 1.4 de uma vez,
   porque são a mesma decisão vista de quatro ângulos: qual fuso define um "dia",
   como se derivam os limites de semana/mês/quadrimestre, e qual carimbo de tempo
   delimita o período do Analyse.
2. **Emendas.** Cenários faltantes no `mvp.md` (1.5 a 1.8), ports `SecretStore` e
   `PropertyDefRepository` nas ADRs 0004 e 0002, e os três pontos abertos do
   roadmap promovidos a decisão.

O que **não** está nesta auditoria: escolha de alvo de execução (desktop,
browser) e qualquer detalhe de implementação. São decisões independentes destas,
e nenhuma delas destrava as lacunas acima.
