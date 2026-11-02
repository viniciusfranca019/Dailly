---
type: Feature
title: Cofre de segredos
description: Segredos do Requests cifrados no próprio SQLite, abertos pela senha da sessão junto do DAILLY_SECRET_KEY do .env, com a tela de destravar, mascarar e revelar.
tags: [requests, cofre, segredos, seguranca]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- O botão "Cofre" do Requests abre o painel, que tem cinco estados: sem a chave no
  `.env` (explica como gerar a `DAILLY_SECRET_KEY`), só a recuperação (sem `.env`, com
  cofre), não criado (criar com uma senha de 8 caracteres ou mais), trancado (abrir com
  a senha ou a chave de recuperação) e aberto.
- Ao criar, a chave de recuperação aparece **uma vez**, até clicar em "Guardei a chave".
- Aberto, lista os segredos mascarados (`••••••••`), com revelar e esconder, copiar sem
  deixar o valor na tela, e apagar; grava nome e valor; e tranca.
- Uma request que precisa de um segredo com o cofre trancado faz a tela dizer qual,
  pedir a senha ali e repetir a execução ao abrir. Uma request que não usa o cofre
  executa trancada mesmo.
- Uma request usa um segredo por `{{nome}}`, e várias requests podem usar o mesmo nome.

# Regras

- O cofre só abre com **as duas peças**: a senha digitada na sessão e o
  `DAILLY_SECRET_KEY` do `.env`. Uma DEK aleatória cifra cada valor em AES-256-GCM,
  com nonce por gravação e o par (ambiente, nome) no AAD; a senha passa por `scrypt` e
  `HKDF`. A chave de recuperação abre sozinha uma segunda cópia da DEK.
- Não há hash da senha: senha errada se sabe porque a tag GCM não fecha.
- A DEK vive só em memória: a API sobe trancada, e reiniciá-la tranca.
- Os segredos são chaveados por (ambiente, nome) e resolvidos no servidor, na execução;
  hoje só existe o ambiente `default`.
- Toda resposta sai com `Cache-Control: no-store`, a listagem traz só os nomes, e
  `secure_delete = ON` garante que o valor apagado não fica nos bytes do banco.
- Status: 423 trancado, 412 sem a `DAILLY_SECRET_KEY`, 401 senha errada, 409 cofre já
  existe, 404 inexistente, 400 senha curta ou nome inválido.
- O porquê de cada peça, e o que foi descartado (SQLCipher, keychain, só `.env`, só
  senha): [Arquitetura](/conventions/architecture.md), ADR 0013.

# Onde mora

- `server/src/shell/vault.ts` (o `SecretStore`, um por processo),
  `server/src/modules/vault/` (rotas e tabelas `vault`, `vault_slots`, `secrets`)
- `ui/src/modules/requests/ui/vault/VaultPanel.vue`, `ui/src/shared/vault.ts`,
  `ui/src/adapters/http-vault-client.ts`
- `.env.example` (a `DAILLY_SECRET_KEY`)

# Entregue

A decisão no #13, o servidor no #14 e a tela no #16, todos em 2026-11-02. Exige
`VITE_REQUESTS=true` e a `DAILLY_SECRET_KEY` no `.env` da raiz; sem ela, a API sobe e o
cofre diz o que falta.

# Limites

- Trocar a senha existe só na API (`PUT /vault/password`), sem tela.
- Perder a senha e a chave de recuperação perde os valores.
- As entradas do diário continuam em texto puro.
