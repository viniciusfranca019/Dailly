---
type: Feature
title: Imagem Docker do dailly
description: make image builda dailly:<versão> a partir da main, sem registry; um container serve a tela e a API na mesma origem, o diário fica num volume e o MCP sai da própria imagem.
tags: [docker, imagem, deamon, mcp]
status: stable
since: 0.1.25
generated: { by: regulus/claude-opus-5-5, at: 2026-11-09T18:30:00-03:00 }
---

# O que faz

- `make image` builda `dailly:<versão>` (e `dailly:latest`), com a versão do `VERSION`
  da `main`, a partir da `main` por `git archive`: só o que está commitado nela entra, e
  um arquivo solto na pasta não. `IMAGE_REF=<ref>` builda outro ref, para testar antes
  do merge, como `dailly:ref-<sha>`: só a `main` escreve as tags que o deamon roda.
- Um container serve a tela em `/` e a API em `/api`, na mesma origem, com o Tasks e o
  Requests ligados, como no `make start`.
- O diário fica em `/data/dailly.sqlite`, um volume. Recriar o container não perde nada.
- O MCP vem na imagem: `docker exec -i <container> dailly-mcp` fala com a API do mesmo
  container.
- `make image-check` prova os cinco cenários contra o Docker de verdade (fora do `make
  check`, que roda sem Docker). A regra das tags (só a `main` move `dailly:<versão>` e
  `latest`) roda no `make check`, com um docker falso.

Rodar à mão, no diário de verdade:

```bash
make image
mkdir -p ~/.config/dailly   # sem ela, o Docker a cria de root e o node não grava o diário
docker run -d --name dailly -p 127.0.0.1:4318:4318 \
  -v ~/.config/dailly:/data --env-file .env dailly:latest   # .env: o DAILLY_SECRET_KEY do cofre
```

O deamon da Workstation (`make install-deamon dailly`) faz isso com `restart:
unless-stopped`.

# Regras

- **Sem registry.** A imagem nasce nesta máquina; o repo pode ficar privado sem mudar
  nada.
- **Só nesta máquina.** No container o bind é `0.0.0.0` (`DAILLY_HOST`), porque a porta
  só existe como o Docker a publica, e ela é publicada em `127.0.0.1`. A guarda de Host
  (ADR 0012) continua e cobre a tela também.
- **Base fixada:** `node:24.18.0-bookworm-slim`, por tag e digest; compiladores só no
  estágio de build; o processo roda como `node` (uid 1000, o mesmo dono do
  `~/.config/dailly` do host).
- **O que vem do ambiente:** `DAILLY_TZ` e `DAILLY_SECRET_KEY` (o cofre) não estão na
  imagem; quem roda o container os passa.

# Onde mora

- `.docker/`, tudo de Docker do repo, como na Workstation: `Dockerfile`,
  `Dockerfile.dockerignore`, `dailly-mcp`, `image-check.sh` (os cenários, com Docker),
  `image-tags.test.sh` (a regra das tags, sem Docker, no
  `make check`)
- os alvos `image` e `image-check` do `Makefile`
- `server/src/shell/app.ts` (`uiDir`, `/api`), `server/src/dev.ts` (`DAILLY_HOST`,
  `DAILLY_UI_DIR`), `server/src/serves-ui.test.ts`

# Entregue

No card #61, em 2026-11-09.

# Limites

- Não sobe o deamon nem registra o MCP: isso é da Workstation.
- A imagem tem as dependências de desenvolvimento (o `tsx` roda o TypeScript): cerca de
  600 MB.
