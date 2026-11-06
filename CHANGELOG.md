version: 0.1.21

- Tasks F8 (#46): o painel da tarefa põe as labels globais do Daily Log, escolhendo uma existente ou criando digitando, e o card e a linha mostram os chips. As labels vão em `entry_labels` pelo `PATCH /tasks/:key` com `labelIds`; um id que não existe é recusado.
- O seletor e a paleta das labels viram a capacidade `ui/src/capabilities/labels`, usada pelo Daily Log e pelo Tasks.
