version: 0.1.24

- MCP do dailly (#58): o Claude Code também opera o Daily Log e as labels. `list_entries` (um período, por padrão hoje no fuso da API, com filtro por labels e propriedades), `get_entry`, `create_entry`, `update_entry` e `delete_entry` rodam os use-cases da tela; `list_labels` e `create_label` cuidam das labels globais. Labels vão pelo nome, e uma que não existe é recusada.
- `update_task` põe e tira labels pelo nome (`addLabels`, `removeLabels`) sem apagar as outras, e as tarefas mostram as labels pelo nome.
