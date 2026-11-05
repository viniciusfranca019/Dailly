version: 0.1.5

- Tasks F3 (#22): o painel da tarefa, aberto pelo card ou pela linha, para editar título, status, prioridade e o corpo no editor de blocos, salvar com Ctrl+S e apagar com confirmação.
- `PATCH /tasks/:key` passa a aceitar qualquer subconjunto de `title`, `priority`, `body` e `statusId` com `rank`; o `TaskStore.move` do F2 virou `TaskStore.update`.
- A tarefa traz o `body` da Entry no `GET /tasks`.
