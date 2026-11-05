---
type: PRD
title: Daily Log, Fase 2
description: O Daily Log completo, editar e apagar registro, labels, propriedades e filtros na timeline, para o diário poder ser corrigido e recortado por assunto antes de o Analyse lê-lo.
tags: [daily-log, entries, labels, propriedades, filtros, prd]
status: stable
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T21:00:00-03:00 }
---

# Daily Log, Fase 2

Gerado e refinado em modo delegado (05/11): o dono pediu a frente antes da v2 do Tasks
e aceitou as recomendações sem parar. A fonte é a Fase 2 do `TODO.md` ("labels,
propriedades, editar e apagar entrada, e filtros na timeline combinando label e
propriedade") e a decisão de dados de [Arquitetura](/conventions/architecture.md) (era
a ADR 0002). As duas perguntas que a arquitetura deixou em aberto para esta
decomposição estão fechadas na RN4 e no Fora de escopo. O desenho técnico está no
anexo, abaixo do contrato.

## Ficha

```
Tipo: feature
Dono: Vinicius
Porquê: hoje o Daily Log só cria e lista, então um registro errado fica errado para sempre e o diário não se recorta por assunto, que é o recorte que o Analyse vai ler
Métrica: registros da semana com ao menos uma label hoje 0 → meta metade dos registros da semana nas 4 semanas depois de F2 entregue
Refinado: sim
```

A linha de base é 0 por construção, porque hoje não existe label, e a meta se lê do
próprio SQLite (`entry_labels` contra `entries` com `kind = 'log'` no período).

## Jornadas

```
J1: Corrigir um registro
  J1.1 Pessoa clica num registro da timeline     → abre o editor com o corpo, o dia, as labels e as propriedades dele
  J1.2 Pessoa edita e salva (Ctrl+S)             → a timeline mostra o registro mudado, no dia certo
  J1.3 Pessoa troca o dia do registro e salva    → o registro vai para o dia novo na timeline
  Desvios:
  J1.2a Corpo apagado por inteiro                → recusa com "o corpo da entrada é obrigatório", nada é gravado
  J1.2b A API não responde                       → erro junto do editor, e o texto editado continua nele
  J1.1a O registro foi apagado em outra aba      → salvar mostra "registro não encontrado" e a timeline é relida

J2: Apagar um registro
  J2.1 Pessoa apaga um registro e confirma       → ele some da timeline
  Desvios:
  J2.1a Pessoa cancela a confirmação             → nada muda

J3: Rotular um registro
  J3.1 Pessoa escolhe uma label existente, no composer ou no editor → a label aparece no registro, com a cor dela
  J3.2 Pessoa digita um nome que não existe e confirma → a label é criada com uma cor e aplicada
  J3.3 Pessoa tira a label do registro           → ela some do registro, e a label continua existindo
  Desvios:
  J3.2a Nome vazio                               → nada é criado
  J3.2b Nome igual a uma label existente, com outra caixa ("Trabalho" e "trabalho") → aplica a existente, sem criar outra

J4: Cuidar das labels
  J4.1 Pessoa renomeia uma label ou troca a cor  → todo registro com ela mostra o nome e a cor novos
  J4.2 Pessoa apaga uma label e confirma         → ela some de todo registro, e os registros continuam
  Desvios:
  J4.1a Nome novo vazio ou igual ao de outra label → recusa com o motivo
  J4.2a Pessoa cancela a confirmação             → nada muda

J5: Dar propriedades a um registro
  J5.1 Pessoa adiciona a propriedade "humor" com o valor "bom" → o registro mostra "humor: bom"
  J5.2 Pessoa começa a digitar a chave          → o campo sugere as chaves já usadas, cada uma com o tipo dela
  J5.3 Pessoa usa uma chave nova pela primeira vez → escolhe o tipo (texto, número ou sim/não), e ele vale dali em diante
  J5.4 Pessoa tira a propriedade do registro     → ela some do registro
  Desvios:
  J5.1a Valor que não é do tipo da chave ("abc" em "horas", que é número) → recusa com "horas espera um número"
  J5.1b Chave vazia                              → nada é adicionado

J6: Recortar a timeline
  J6.1 Pessoa escolhe uma label no filtro       → a timeline mostra só os registros com ela
  J6.2 Pessoa escolhe uma segunda label         → mostra os registros com uma ou outra
  J6.3 Pessoa acrescenta "humor = bom"           → mostra só os que têm uma das labels e humor bom
  J6.4 Pessoa limpa o filtro                     → a timeline volta inteira
  Desvios:
  J6.1a Nenhum registro bate                     → "nenhum registro com esse filtro", com o botão de limpar
```

## Regras

```
RN1: Uma label é global, a mesma para registros do dia e tarefas, com nome único sem diferenciar maiúsculas e uma cor, porque o Tasks v2 (RN13 de lá) usa as mesmas, e duas listas divergiriam
RN2: Apagar uma label a tira de todo registro e de toda tarefa e não apaga nenhum deles, porque a label classifica o fato, não é o fato
RN3: O valor de uma propriedade fica no registro e o tipo da chave fica numa definição única (texto, número ou sim/não), criada no primeiro uso, porque o filtro e a sugestão precisam que "horas" seja número em todo registro
RN4: O filtro combina labels por OU e combina labels, propriedades e período por E, porque é o EntryFilter que o domínio já declara (labelIds em OU) e o recorte que o Analyse faz é "isto e aquilo no período"
RN5: Editar mantém o id e a data de criação e carimba a de atualização; trocar o dia segue a regra do composer (hoje é agora, outro dia é meio-dia), porque o recorte por período lê o instante do registro e as duas telas não podem divergir
RN6: Editar, apagar e filtrar valem só para registros do dia, nunca para tarefas, porque a tarefa se edita no painel dela e a timeline não mostra tarefa (RN6 do Tasks)
RN7: Uma gravação recusada faz a tela reler e voltar ao que o servidor tem, porque é a regra do Requests e do Tasks (reler é voltar)
```

## Fora de escopo

```
Não apaga nem renomeia uma chave de propriedade, nem troca o tipo dela, porque o que fazer com os valores já gravados é a pergunta que a arquitetura deixou em aberto, e o uso ainda não pediu; a definição só nasce
Não salva filtro nem visualização, porque visualização salva é do Tasks e do Notion, e aqui o filtro é de uma olhada
Não guarda o filtro na URL nem o lembra ao recarregar, porque o shell não tem rota por URL (TAIL T1)
Não tem label dentro de label nem grupo de labels, porque uma lista plana cobre um diário pessoal
Não tem histórico de edições, porque o diário guarda o fato corrigido e o git do backup guarda o resto
Não edita a hora exata do registro, só o dia, porque o composer também só escolhe o dia
Não tem propriedade em tarefa, porque a tarefa já tem os campos dela (status, prioridade) e o Tasks v2 não pediu
Não reconstrói a tabela entries, porque labels e definições de propriedade cabem em tabelas novas e os valores já têm a coluna props
```

## Latitude de produto

```
Quando escolher texto, ícone, cor, espaçamento, paleta de labels e atalho de teclado → decido, seguindo o Linear
Quando escolher onde o editor do registro abre (no lugar do card, num painel, no composer) → decido, seguindo o painel do Tasks
Quando a escolha pedir uma dependência nova (lib de componentes, combobox) → paro e pergunto ao Dono
Quando mudar uma regra RN → paro e pergunto ao Dono
Quando criar as tabelas labels, entry_labels e property_defs com os próximos números livres do user_version → decido
Quando a migration precisar reconstruir ou reescrever a tabela entries → paro e pergunto ao Dono
Quando a resposta de GET /entries ou POST /entries mudar além de devolver labelIds e props preenchidos → paro e pergunto ao Dono
```

## Fatias

```
F1: Editar e apagar registro — cobre J1.1, J1.1a, J1.2, J1.2a, J1.2b, J1.3, J2.1, J2.1a, RN5, RN6, RN7 — depende de —      → a criar
F2: Labels                   — cobre J3.1, J3.2, J3.2a, J3.2b, J3.3, J4.1, J4.1a, J4.2, J4.2a, RN1, RN2, RN7 — depende de F1 → a criar
F3: Propriedades             — cobre J5.1, J5.1a, J5.1b, J5.2, J5.3, J5.4, RN3, RN7                   — depende de F1     → a criar
F4: Filtrar a timeline       — cobre J6.1, J6.1a, J6.2, J6.3, J6.4, RN4                               — depende de F2, F3 → a criar
```

F1 vem primeiro porque é ela que abre o editor de um registro, onde labels e
propriedades se aplicam a um registro que já existe. F2 e F3 correm em paralelo depois
dela. F4 fecha, porque filtra pelo que F2 e F3 gravam. A F8 do [Tasks](/prd/tasks.md)
(labels nas tarefas) passa a depender da F2 daqui, que é quem cria a label.

---

# Anexo: o desenho que o refinamento fixou

Fora do contrato.

| Decisão | Ficou | Descartado |
|---------|-------|------------|
| Labels | tabela `labels` (`id`, `name` com índice único em `lower(name)`, `color`) e `entry_labels` (`entry_id`, `label_id`, `ON DELETE CASCADE` nos dois lados) | coluna JSON na entrada, que não garante nome único nem apaga a label de todos de uma vez |
| Propriedades | valor na coluna `props` (JSON) que já existe; `property_defs` (`key` único, `type` com CHECK em `text`, `number`, `boolean`) | EAV (`entry_property_values`), descartado na arquitetura: joins para remontar uma entrada |
| Filtro | OU nas labels, E entre dimensões (RN4); propriedade por `json_extract` | E entre labels, que esvaziaria a timeline com duas labels de assunto vizinho |
| Excluir uma definição de propriedade | fora da Fase 2 | apagar os valores junto, ou deixá-los órfãos: decidir quando o uso pedir |
| Editar | `PATCH /entries/:id` parcial, como o `PATCH /tasks/:key` | `PUT` do registro inteiro, que obriga a tela a mandar o que não mudou |
| Labels nas tarefas | as mesmas tabelas, ligadas pelo id da Entry (a tarefa é uma Entry, RN1 do Tasks) | uma tabela `task_labels`, que duplicaria a ligação |

As rotas que respondem 501 hoje (o filtro por label no `GET /entries`, o `update`,
`delete` e `getById` do `EntryRepository`) passam a existir de verdade. O
`EntryRepository` já declara os cinco métodos, então o domínio não ganha método novo:
ganha os use-cases `updateEntry` e `deleteEntry`, e o `EntryFilter` já tem `labelIds` e
`props`.
