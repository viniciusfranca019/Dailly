version: 0.1.10

- Daily Log, Fase 2, F1 (#33): clicar num registro da timeline o abre no editor para corrigir o corpo e o dia, ou apagar com confirmação. Registro apagado em outra aba diz "registro não encontrado" e relê a timeline.
- `GET`, `PATCH` e `DELETE /entries/:id`, só para registros do dia (a Entry de uma tarefa é 404). O `EntryRepository` implementa `getById`, `update` e `delete`, e o domínio ganha `updateEntry`, `deleteEntry` e `EntryNotFoundError`.
