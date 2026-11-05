version: 0.1.11

- Daily Log, Fase 2, F2 (#34): labels globais. O campo "+ label" aplica uma label existente (sem diferenciar maiúsculas) ou cria uma com a próxima cor da paleta; "Gerenciar labels" renomeia, recolore e apaga. Apagar uma label a tira de todo registro.
- Migration 6: `labels` (nome único por `name_key`, cor da paleta) e `entry_labels`, com cascade. Rotas `/labels`; `POST` e `PATCH /entries` gravam `labelIds`, e uma label desconhecida é 400.
