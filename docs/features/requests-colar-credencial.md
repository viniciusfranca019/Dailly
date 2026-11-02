---
type: Feature
title: Colar um curl com credencial
description: Colar um curl com Authorization, Cookie ou chave de API manda o valor ao cofre antes de importar e deixa {{nome}} na request.
tags: [requests, cofre, curl, credencial]
status: stable
since: 0.1.0
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:30:00-03:00 }
---

# O que faz

- Colar um curl com credencial literal (`Authorization`, `Cookie`, `x-api-key`, `-u`…)
  abre, antes do editor, um form com uma linha por credencial: o header, o valor
  mascarado e um nome sugerido, editável.
- Com o cofre trancado, o form pede a senha ou a chave de recuperação; nada é gravado
  antes disso.
- "Guardar no cofre e importar" manda cada valor ao [cofre](/features/cofre-de-segredos.md)
  e deixa `{{nome}}` na request, mantendo o esquema (`Bearer {{nome}}`). O que é salvo
  não contém o valor.
- "Cancelar" não salva nada e devolve a barra de URL ao que era.
- Um nome que já existe com **outro** valor é recusado; com o mesmo valor, é
  reaproveitado.
- Sem a `DAILLY_SECRET_KEY` ou sem cofre criado, o form diz o que falta e só oferece
  cancelar. Um curl sem credencial importa como antes, sem form
  ([Colar um curl](/features/requests-colar-curl.md)).

# Regras

- Detecta por nome (`authorization`, `proxy-authorization`, `cookie`, `x-api-key`,
  `api-key`, `x-auth-token`, `token`…) e pelo sufixo `-api-key`, `-token` ou `-secret`.
  Um valor que já tem `{{…}}` não conta.
- `-u`: com senha, o segredo é a senha; sem ela, o usuário.
- **Não há opção de salvar em claro**, e a importação não acontece antes de o valor ir
  ao cofre. Foi descartado importar e trocar depois: a chave ficaria no rascunho, a um
  Salvar do SQLite.
- Sobrescrever um nome existente foi descartado porque trocaria a chave de todas as
  requests que já o usam.
- A gravação é **tudo ou nada**: todos os nomes são conferidos antes da primeira escrita,
  e uma falha no meio desfaz o que já foi gravado.
- Um `{{nome}}` dentro de uma string de corpo JSON entra escapado, por um gancho
  opcional `ProtocolDriver.interpolate` que o HTTP usa só no corpo. Foi descartado
  escapar no `interpolate` genérico, que não sabe o que é corpo (gRPC e AMQP terão outros
  formatos).

# Onde mora

- `packages/requests-core/src/http/` (`credentials.ts`, `json-body.ts`),
  `packages/requests-core/src/protocol.ts`
- `ui/src/modules/requests/ui/vault/CredentialsPrompt.vue`,
  `ui/src/modules/requests/model/credentials.ts`

# Entregue

No #17, em 2026-11-02. Exige `VITE_REQUESTS=true`, a `DAILLY_SECRET_KEY` e um cofre
criado.

# Limites

- Credencial no corpo (`{"api_key": "…"}`) ou na query (`?api_key=`) não é detectada.
- Trocar de request com a gravação em voo deixa no cofre os segredos já gravados.
- O ambiente `default` e o formato do nome estão escritos na UI e no servidor.
