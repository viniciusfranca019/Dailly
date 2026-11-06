version: 0.1.20

- Tasks F9 (#47): Ctrl+K, em qualquer tela, abre a busca de tarefas pela chave (mesmo com o prefixo antigo do board) ou por parte do título, em todos os boards; escolher leva ao Tasks, no board da tarefa, com o painel aberto. Nasce a costura de comandos do shell: um módulo declara atalhos no manifesto e um componente por atalho.
- Os tipos de board, comentário e status passam a sair de `@shared`, que o `vue-tsc` cobrava do `Tasks.vue`.
