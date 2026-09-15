# MVP — Comportamentos Esperados (BDD)

Este documento especifica, em estilo BDD (Gherkin), o comportamento esperado dos
módulos do MVP e o escopo funcional mínimo da UI. Serve como base para os testes
de aceitação.

- Arquitetura: [adrs/0001-arquitetura-geral.md](adrs/0001-arquitetura-geral.md)
- Data layer: [adrs/0002-data-layer.md](adrs/0002-data-layer.md)
- UI: [adrs/0003-ui.md](adrs/0003-ui.md)

Convenção: `Dado` (contexto) · `Quando` (ação) · `Então` (resultado esperado) ·
`E`/`Mas` (continuações).

---

## Módulo: Daily Log

Registro de pensamentos/acontecimentos relevantes do dia, com labels e
propriedades criadas livremente.

### Funcionalidade: Criar uma entrada

```gherkin
Cenário: Criar entrada com corpo e data do fato
  Dado que estou no Daily Log
  Quando escrevo o corpo "Descobri um padrão melhor para o adapter"
  E defino a data do fato como 2026-07-24
  E confirmo a criação
  Então a entrada é persistida com um id (UUID)
  E aparece no topo da linha do tempo daquele dia
  E recebo um feedback de sucesso

Cenário: Corpo vazio não é permitido
  Dado que estou criando uma entrada
  Quando deixo o corpo em branco
  E tento confirmar
  Então a criação é bloqueada
  E vejo uma mensagem indicando que o corpo é obrigatório

Cenário: Data do fato assume o momento atual por padrão
  Dado que estou criando uma entrada
  Quando não informo a data do fato
  E confirmo a criação
  Então a data do fato é preenchida com o instante atual
```

### Funcionalidade: Editar e excluir entradas

```gherkin
Cenário: Editar o corpo de uma entrada existente
  Dado que existe uma entrada com corpo "rascunho"
  Quando altero o corpo para "versão final"
  E salvo
  Então a entrada passa a exibir "versão final"
  E o campo updated_at é atualizado

Cenário: Excluir uma entrada
  Dado que existe uma entrada na linha do tempo
  Quando solicito a exclusão
  E confirmo
  Então a entrada é removida da linha do tempo
  E suas associações de label são removidas
```

### Funcionalidade: Labels criadas livremente

```gherkin
Cenário: Criar uma nova label
  Dado que estou gerenciando labels
  Quando crio a label "ideia" com a cor azul
  Então a label "ideia" fica disponível para associação

Cenário: Nome de label é único
  Dado que já existe a label "ideia"
  Quando tento criar outra label chamada "ideia"
  Então a criação é rejeitada
  E vejo uma mensagem de nome duplicado

Cenário: Associar labels a uma entrada
  Dado que existe a entrada "Reunião de arquitetura"
  E existem as labels "trabalho" e "decisão"
  Quando associo ambas as labels à entrada
  Então a entrada passa a exibir as labels "trabalho" e "decisão"

Cenário: Remover uma label não apaga as entradas
  Dado que a label "trabalho" está associada a 3 entradas
  Quando excluo a label "trabalho"
  Então as 3 entradas continuam existindo
  Mas não exibem mais a label "trabalho"
```

### Funcionalidade: Propriedades criadas livremente

```gherkin
Cenário: Definir uma propriedade e atribuir valor
  Dado que crio a propriedade "humor" do tipo texto
  E existe a entrada "Dia produtivo"
  Quando atribuo à entrada o valor "otimista" para "humor"
  Então a entrada passa a ter a propriedade humor = "otimista"

Cenário: Valor deve respeitar o tipo da propriedade
  Dado que existe a propriedade "energia" do tipo number
  Quando atribuo o valor "alto" (texto) a "energia" em uma entrada
  Então a atribuição é rejeitada com mensagem de tipo inválido

Cenário: Propriedade ad-hoc sem definição prévia
  Dado que estou editando uma entrada
  Quando adiciono a chave "local" com valor "escritório" sem defini-la antes
  Então o valor é salvo na entrada
  E a UI sugere registrar "local" como propriedade conhecida
```

### Funcionalidade: Linha do tempo e filtros

```gherkin
Cenário: Listar entradas por ordem de data
  Dado que existem entradas em datas diferentes
  Quando abro a linha do tempo
  Então as entradas são exibidas da mais recente para a mais antiga

Cenário: Filtrar por período
  Dado que existem entradas em maio e em julho
  Quando filtro pelo período de 2026-07-01 a 2026-07-31
  Então apenas as entradas de julho são exibidas

Cenário: Filtrar por labels (OR entre labels)
  Dado que existem entradas com labels "ideia" e outras com "trabalho"
  Quando filtro pelas labels "ideia" ou "trabalho"
  Então são exibidas as entradas que tenham qualquer uma das duas

Cenário: Filtrar por propriedade
  Dado que existem entradas com humor "otimista" e outras com humor "cansado"
  Quando filtro por humor = "otimista"
  Então apenas as entradas com humor "otimista" são exibidas

Cenário: Estado vazio
  Dado que nenhum registro corresponde ao filtro
  Quando aplico o filtro
  Então vejo um estado vazio explicativo, sem erro
```

---

## Módulo: Analyse

Gera análises/resumos de um período a partir do material do Daily Log, aplicando
seleções de labels/propriedades. Cada análise é um **Processor** que produz uma
**Materialization** persistida.

### Funcionalidade: Gerar análise de um período

```gherkin
Cenário: Resumo da semana
  Dado que existem entradas dentro da semana selecionada
  Quando escolho o período "semana" para 2026-07-20 a 2026-07-26
  E disparo a análise
  Então o sistema coleta as entradas do período
  E as envia ao Summarizer
  E exibe a materialização resultante em markdown
  E a materialização é persistida com module="analyse" e periodType="week"

Cenário: Resumo do mês
  Dado que existem entradas dentro do mês selecionado
  Quando escolho o período "mês" para julho/2026
  E disparo a análise
  Então a materialização cobre period_start e period_end do mês inteiro
  E é persistida com periodType="month"

Cenário: Resumo do quadrimestre
  Dado que existem entradas no quadrimestre selecionado
  Quando escolho o período "quadrimestre"
  E disparo a análise
  Então a materialização é persistida com periodType="quadrimester"
```

### Funcionalidade: Análise com filtros

```gherkin
Cenário: Analisar apenas entradas com certas labels
  Dado que existem entradas variadas na semana
  Quando escolho o período "semana"
  E restrinjo às labels "trabalho" e "decisão"
  E disparo a análise
  Então apenas entradas com essas labels compõem o material analisado
  E o filtro usado fica registrado em input_filter da materialização

Cenário: Filtrar por propriedade na análise
  Dado que existem entradas com a propriedade humor
  Quando restrinjo a análise a humor = "otimista"
  Então apenas essas entradas alimentam o resumo
```

### Funcionalidade: Casos de borda e falhas

```gherkin
Cenário: Período sem entradas
  Dado que não há entradas no período selecionado
  Quando disparo a análise
  Então nenhuma chamada ao Summarizer é feita
  E vejo um aviso de que não há material para analisar
  E nenhuma materialização é persistida

Cenário: Falha do Summarizer/adaptador de IA
  Dado que há entradas no período
  Mas o Summarizer está indisponível
  Quando disparo a análise
  Então vejo uma mensagem de erro clara
  E a operação pode ser repetida
  E nenhuma materialização parcial é persistida

Cenário: Progresso durante a geração
  Dado que disparei uma análise
  Quando o Summarizer está processando
  Então vejo um indicador de progresso
  E os controles de disparo ficam desabilitados até concluir
```

### Funcionalidade: Histórico de análises

```gherkin
Cenário: Rever análises anteriores
  Dado que já gerei análises em datas anteriores
  Quando abro o histórico do Analyse
  Então vejo as materializações passadas com período e data de criação
  E posso reabrir e ler o conteúdo de cada uma
```

---

## Escopo funcional mínimo da UI (MVP)

Requisitos funcionais que a UI deve cumprir. Detalhes de stack e layout em
[adrs/0003-ui.md](adrs/0003-ui.md).

### Daily Log

```gherkin
Cenário: Navegar até o Daily Log
  Dado que abro o aplicativo
  Quando seleciono o módulo "Daily Log"
  Então vejo o editor de nova entrada e a linha do tempo

Cenário: Corpo em markdown
  Dado que estou escrevendo uma entrada
  Quando uso sintaxe markdown no corpo
  Então a entrada é renderizada com a formatação correspondente na leitura

Cenário: Gestão de labels e propriedades pela UI
  Dado que estou no Daily Log
  Então posso criar/editar/excluir labels
  E posso criar propriedades (nome + tipo)
  E posso associá-las às entradas
```

### Analyse

```gherkin
Cenário: Navegar até o Analyse
  Dado que abro o aplicativo
  Quando seleciono o módulo "Analyse"
  Então vejo o seletor de período, os filtros e o histórico de análises

Cenário: Disparar e ler uma análise
  Dado que selecionei período e filtros
  Quando disparo a análise
  Então vejo o progresso e, ao concluir, a materialização renderizada em markdown
```

### Settings — Provider de IA (BYOK)

```gherkin
Cenário: Configurar um provider de IA com a própria chave
  Dado que estou em Settings
  Quando escolho o provider "Anthropic" e o modelo desejado
  E informo minha chave de API
  E salvo
  Então a chave é guardada com segurança (keychain do SO)
  E esse provider/modelo passa a ser o ativo para os Processors

Cenário: Validar a chave informada
  Dado que informei uma chave de API
  Quando salvo a configuração
  Então o app valida a chave junto ao provider
  E, se inválida, vejo uma mensagem de erro sem salvar

Cenário: Analyse exige provider configurado
  Dado que nenhum provider de IA está configurado
  Quando abro o Analyse e tento disparar uma análise
  Então sou orientado a configurar um provider em Settings
  E a análise não é disparada
```

### Global

```gherkin
Cenário: Feedback consistente de escrita
  Dado que executo qualquer ação de escrita (criar/editar/excluir)
  Quando a ação conclui
  Então recebo feedback de sucesso ou de erro

Cenário: Estados de carregamento e erro
  Dado que a UI busca dados ou aguarda a IA
  Quando a operação está em andamento
  Então vejo um estado de loading
  E, em caso de falha, um estado de erro com opção de repetir
```

---

## Fora do escopo do MVP

- Backend remoto e qualquer origem de dados remota (o app é local-first puro).
- Backup/restore do arquivo SQLite em providers de nuvem (Google Drive, iCloud,
  etc.) — pós-MVP; ver [adrs/0005-backup-restore.md](adrs/0005-backup-restore.md).
- Sync bidirecional entre dispositivos (o backup é "último upload vence").
- Módulos além de Daily Log e Analyse.
- Períodos de análise além de semana / mês / quadrimestre.
- IA local pesada (embeddings/RAG); previsto via sidecar futuro.
