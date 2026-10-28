# ADR 0012 — Só web: o desktop sai, a API passa a se guardar sozinha

- **Status:** Aceito
- **Data:** 2026-10-28
- **Decisores:** Vinicius
- **Relaciona:** supersede a [ADR 0008](0008-electron-como-shell.md) (Electron
  como shell) · emenda a [ADR 0007](0007-api-local-e-tempo.md) (porta e token)
  · mantém a [ADR 0011](0011-requests-modulo-e-execucao.md) (execução no
  servidor)

## Contexto

O dailly tinha dois jeitos de rodar: o app Electron (`make desktop`), com a API
dentro do processo main, e o navegador (`make dev`), com a API ao lado. O uso
real já era o navegador, e o empacotamento AppImage, o motivo de ser desktop,
estava parado por decisão do autor desde a Fase 1.

Manter os dois tem custo em tudo que atravessa o shell: o token entregue por
IPC, o preload em CommonJS, a janela endurecida, a porta efêmera, e cada bug
precisando ser conferido nos dois lugares. O objetivo do produto (diário,
Requests, Analyse) não depende de nada que só o desktop dá.

## Decisão

**O dailly é uma aplicação web que roda na máquina do autor.** `desktop/` sai
inteiro. A API continua um processo Node com Fastify e SQLite; o renderer é
servido pelo vite (`make dev` em desenvolvimento, `make start` com o diário de
verdade, em `vite preview`), que faz proxy de `/api` para a API, como já fazia
em dev.

### Local, não hospedada

Só nesta máquina. Hospedar, para abrir de qualquer lugar, muda o problema
inteiro: autenticação de pessoa, não de processo; banco com acesso concorrente
em vez de um arquivo; TLS. É outra ADR, se um dia vier, e nada aqui a impede.

### O diário fica onde está

`make start` abre `~/.config/dailly/dailly.sqlite`, o arquivo onde o Electron o
guardava (`APP_DB` no Makefile). Cortar o desktop não move nem copia dado
nenhum, e as migrations são as mesmas que o desktop rodaria ao abrir.

`make start` usa a porta 4318 (`START_PORT`), e não a 4317 do `make dev`, para os
dois rodarem juntos sem que um aponte para o banco do outro.

### O modelo de ameaça muda, e a defesa muda com ele

A ADR 0008 protegia a API **dos outros processos da máquina**, com um token por
execução entregue por IPC. Essa proteção valia pouco: um processo do mesmo
usuário lê o SQLite direto, sem passar pela API.

Sem o Electron, o cliente é um navegador, e o navegador abre outros sites. Esses
são a ameaça agora, por dois caminhos:

- **DNS rebinding:** um site faz o próprio domínio resolver para `127.0.0.1` e
  fala com a API como se fosse de mesma origem. Fechado pelo **Host**: só
  `localhost`, `127.0.0.1` e `[::1]`, em qualquer porta, passam.
- **CSRF:** um `POST` `text/plain` de outro site não passa por preflight. Ele
  chegaria ao `/requests/:id/execute`, que é egresso para a internet a partir
  desta máquina. Fechado pelo **Origin**: quando presente, tem que ser desta
  máquina. Ausente (curl, testes, um GET pelo proxy) passa.

As duas regras moram num hook `onRequest` do shell do servidor, antes do token,
e valem para toda rota, `/health` incluída.

**Risco que fica, dito:** outra aplicação web servida em `localhost` nesta
máquina passa pela regra de Origin. A escolha foi não fixar portas na API
(o vite cai para a 5174 quando a 5173 está ocupada, e uma lista de portas
quebraria em silêncio); o risco é de um site que o próprio autor sobe.

### O token

O servidor ainda aceita um token (`createServer({ token })`), e o teste
ponta-a-ponta o exercita. Nada no app o gera hoje: quem gerava era o main do
Electron. Fica, porque é a peça que um modo hospedado reaproveitaria; se esse
modo não vier, remover o token é um PR próprio.

## Consequências

**Positivas**

- Um runtime só para manter e depurar: o que roda em dev é o que roda de verdade.
- Sem Electron, sem preload, sem IPC, sem `electron-builder`: o `pnpm install`
  não baixa mais um Chromium.
- A defesa da API passa a mirar a ameaça que existe para uma API local num
  navegador, em vez de uma que o SQLite já deixava passar.

**Negativas / trade-offs**

- Abrir o diário exige dois processos rodando (`make start`), em vez de um
  ícone. Sem AppImage, não há atalho no menu do sistema.
- O motor de renderização volta a ser o do navegador que o autor usar. A ADR
  0008 fixava um Chromium por causa do `contenteditable` do whiteboard; agora o
  playground (`/playground/`) é a conferência quando o navegador mudar.
- Um atalho de teclado que o navegador reserva (`Ctrl+S`, por exemplo) já era
  tratado pelo renderer; o que o navegador não deixa interceptar fica com ele.

## Alternativas consideradas

- **Manter os dois.** Rejeitada: é o custo que motivou esta ADR, por um
  empacotamento que ninguém estava usando.
- **Servir a UI pelo próprio Fastify (`@fastify/static`), um processo só.**
  Adiada: é dependência nova para trocar dois processos por um, e o `vite
  preview` já faz o proxy que o dev faz. Volta a ser a resposta se `make start`
  incomodar.
- **Manter o token, entregue por cookie da página.** Rejeitada para o modo
  local: um processo local pegaria o cookie pedindo a página, então protegeria
  tão pouco quanto antes, e não protege nada contra os outros sites, que é a
  ameaça de verdade.
