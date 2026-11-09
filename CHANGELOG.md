version: 0.1.25

- Imagem Docker do dailly (#61): `make image` builda `dailly:<versão>` a partir da `main` por `git archive`, sem registry. Um container serve a tela e a API na mesma origem (`/` e `/api`), guarda o diário num volume (`/data`) e traz o MCP (`docker exec -i <container> dailly-mcp`). `make image-check` prova os cenários com Docker de verdade.
- O servidor serve a `ui/dist` quando recebe `DAILLY_UI_DIR`, com o `@fastify/static`, atrás da mesma guarda de Host; `DAILLY_HOST` muda o bind (só a imagem usa). O `make dev` e o `make start` não mudam.
