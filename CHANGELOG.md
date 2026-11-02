version: 0.1.0

- Primeira versão numerada: reúne tudo o que o dailly fazia até aqui. O que cada
  feature faz está em `docs/features/`.
- Daily Log, Fase 1: escrever uma entrada em markdown no editor de blocos e vê-la
  na timeline agrupada por dia, no fuso de `DAILLY_TZ`.
- Requests: colar um curl importa a requisição (#8); o executor é escolhido pelo
  protocolo (#9); a coleção em pastas como no Apidog (#11).
- Só web, só nesta máquina: o desktop sai, `make start` sobe o diário de verdade
  e a API aceita só `Host` e `Origin` desta máquina (#10).
- Cofre de segredos cifrado no SQLite, aberto por senha + `DAILLY_SECRET_KEY`,
  com a tela de destravar, mascarar e revelar (#13, #14, #16); colar curl com
  credencial manda a chave ao cofre e deixa `{{nome}}` na request (#17).
- Docs em OKF (`docs/conventions/`, `docs/features/`), no lugar das ADRs; a
  versão passa a morar em `VERSION` e neste arquivo.
- Dívida: `ModuleDeps` da UI partido, `ExecutedResponse` no
  `@dailly/requests-core/http`, id do Requests vindo da raiz (#12).
