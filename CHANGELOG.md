version: 0.1.26

- Filtro por label no Tasks: acima do board e da lista, as labels globais viram botões; ligar uma mostra só as tarefas com ela, ligar outra soma (OU), e todas as colunas continuam. "Limpar filtro" volta o board inteiro; um filtro que esconde tudo diz "nenhuma tarefa com esse filtro". O filtro sobrevive à troca de board e some ao recarregar, como o do Daily Log.
- Criar pelo + com o filtro ligado faz a tarefa nascer com as labels dele: `POST /tasks` (e o `TaskStore`) aceita `labelIds` opcional, numa gravação só, e recusa com 400 uma label que não existe, sem gastar a chave.
- Os botões de filtro por label viram `LabelFilter`, na capacidade `labels`, usado pelo Daily Log e pelo Tasks.
