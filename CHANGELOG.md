version: 0.1.4

- Tasks F2 (#21): o board kanban, com arrastar entre colunas e dentro delas (drag-and-drop nativo), o "concluída em <dia>" ao soltar em Feito ou Cancelado (RN3, no servidor) e a troca board/lista lembrada no navegador.
- `PATCH /tasks/:key` com `statusId` e `rank`; a posição é calculada por `placeAt` no `@dailly/tasks-core`.
- O Tasks passa a aparecer no `make start` (`VITE_TASKS=true` no alvo).
