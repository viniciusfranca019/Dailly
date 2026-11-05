version: 0.1.3

- Tasks F1 (#20): lista de tarefas agrupada por status, captura por título no "+" de cada status, chave `T-<n>` que nunca é reaproveitada, atrás de `VITE_TASKS`.
- A tarefa é uma Entry: `entries` ganha a coluna `kind` (migration 4, os registros existentes viram `log`), e a timeline do Daily Log mostra só os registros.
- Pacote novo `@dailly/tasks-core` e o módulo `tasks` no servidor (migration 5: `task_statuses`, `tasks`, `task_counter`).
