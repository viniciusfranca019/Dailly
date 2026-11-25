version: 0.1.27

- Board novo nasce com o fluxo Backlog, To Do, In Progress, Review, Land e Done, sem o Cancelado, que entra pelo "+ status" quando o board quiser. Os boards que já existem, o "Tasks" entre eles, ficam com os status que têm.
- A semente do board "Tasks" (a da migration 10) fica separada da de board novo, para o fake em memória seguir igual ao SQLite.
