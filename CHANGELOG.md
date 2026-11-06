version: 0.1.17

- Tasks F4 (#42): vários boards, cada um com nome e prefixo próprio (`CASA-<n>`), a troca entre eles e o último usado lembrado; trocar o prefixo vale só para as tarefas novas, e um prefixo usado nunca vai para outro board. A migration 8 põe as tarefas de antes no board "Tasks", com as chaves T-<n> que já tinham. A API passa a pedir `boardId` em `GET` e `POST /tasks`.
