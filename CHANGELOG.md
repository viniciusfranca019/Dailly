version: 0.1.32

- Cada programa do Tasks ganha comentários próprios: na visão Programas, "Comentários" abre a lista, do mais antigo ao mais novo, e o editor, os mesmos do painel da tarefa. O comentário do programa não aparece nas tarefas dele nem no Daily Log. Na API, `GET`/`POST /programs/:id/comments` e `DELETE /programs/:id/comments/:id`, com a migration 12 (aditiva, roda sozinha ao abrir o banco).
- O MCP ganha `list_programs` e `list_program_comments`, `add_program_comment` e `delete_program_comment`, para a próxima sessão de um programa ler o que foi comentado nele.
