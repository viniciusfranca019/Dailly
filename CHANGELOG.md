version: 0.1.13

- Daily Log, Fase 2, F4 (#36): filtrar a timeline. As labels ligadas somam (OU), cada propriedade restringe (E); "Limpar filtro" volta tudo, e um filtro vazio diz "nenhum registro com esse filtro". Fecha a Fase 2.
- `GET /entries` aceita `labelIds=a,b` e `props[chave]=valor`, lido pelo tipo da chave; o SQLite filtra de verdade em vez de responder 501.
