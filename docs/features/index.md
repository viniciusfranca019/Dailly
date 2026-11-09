# Features

O que o dailly faz hoje, uma feature por conceito: como a pessoa a vê, as regras que
importam e onde mora no código. O Analyse ainda é só uma tela-esqueleto atrás de
`VITE_ANALYSE`, e entra aqui quando fizer alguma coisa.

## Daily Log
* [Daily Log](/features/daily-log.md) - escrever uma entrada sobre o dia e vê-la na timeline agrupada por dia
* [Editor de blocos](/features/whiteboard.md) - o whiteboard estilo Notion: markdown entra, markdown sai

## Requests
* [Colar um curl](/features/requests-colar-curl.md) - colar na barra de URL preenche a requisição inteira
* [Coleção em pastas](/features/requests-colecao.md) - a árvore como no Apidog, com menu, arrastar, renomear e apagar
* [Executar uma request](/features/requests-executar.md) - o servidor executa pelo protocolo, e a tela diz cada falha
* [Cofre de segredos](/features/cofre-de-segredos.md) - segredos cifrados no SQLite, abertos por senha + `.env`
* [Colar um curl com credencial](/features/requests-colar-credencial.md) - a chave vai ao cofre e a request fica com `{{nome}}`

## Tasks
* [Tasks, capturar e listar](/features/tasks-capturar-e-listar.md) - a lista por status, a captura por título e a chave T-<n> que não se reaproveita
* [Tasks, board e a troca board/lista](/features/tasks-board.md) - o kanban com arrastar, o carimbo de conclusão e a visualização lembrada
* [Tasks, painel da tarefa](/features/tasks-painel.md) - editar título, status, prioridade e corpo, e apagar com confirmação
* [Tasks, busca com Ctrl+K](/features/tasks-busca.md) - achar uma tarefa pela chave ou pelo título, de qualquer tela, e abri-la no board dela
* [Tasks, criar rápido com C](/features/tasks-criar-rapido.md) - título, status e prioridade num formulário flutuante, de qualquer tela, no último board usado
* [Tasks, status do board](/features/tasks-status.md) - status com cor em cada board: adicionar, renomear e apagar levando as tarefas
* [Tasks, vários boards](/features/tasks-boards.md) - boards com prefixo próprio, a troca entre eles e a chave <PREFIXO>-<n> congelada

## O app
* [Imagem Docker do dailly](/features/imagem.md) - make image builda da main, sem registry; um container serve tela, API e MCP, com o diário num volume
* [MCP do dailly](/features/mcp.md) - o Claude Code opera tarefas, registros do dia e labels pelo MCP, por stdio, como mais um cliente da API
* [Ordem da barra lateral](/features/ordem-da-barra.md) - arrastar ou Alt+↑/↓ para pôr os módulos na ordem do uso, lembrada no navegador
* [App local](/features/app-local.md) - só web, só nesta máquina: os dois bancos, as portas e a guarda da API
