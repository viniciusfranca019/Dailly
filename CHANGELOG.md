version: 0.1.29

- Programas e foco na API do Tasks (LAB-9, primeira parte, sem tela ainda): `POST /programs` cria um programa com objetivo, janela e "sai quando"; `POST /programs/:id/tasks` põe nele tarefas de qualquer board, uma tarefa em um programa só; `PUT /focus` põe um programa ou uma tarefa avulsa em P0, P1 ou P2, ou tira do foco; `GET /programs`, `GET /focus` e `GET /tasks/:key/program` leem. (#65)
- Migration 11, aditiva: as tabelas de programa, de membros e de foco, sem mexer em tarefas nem em entries. (#65)
