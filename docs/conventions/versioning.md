---
type: Convention
title: Versão
description: SemVer no dailly, com o VERSION da raiz como única fonte do número e o CHANGELOG.md acompanhando cada versão.
tags: [semver, changelog, release]
status: stable
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:10:00-03:00 }
sources:
  - id: semver
    resource: https://semver.org/lang/pt-BR/
    title: Versionamento Semântico 2.0.0
---

# Regra

O dailly segue o Versionamento Semântico,[^semver] no mesmo formato do
Workstation (o `CLAUDE.md` dele, seção "Version"). O número mora num lugar só:
o arquivo `VERSION` da raiz, uma linha `X.Y.Z`. O `version` dos `package.json`
fica `0.0.0`, porque todos são `private` e nada os publica; copiar o número para
eles criaria duas verdades para manter iguais.

Ao lado dele, o `CHANGELOG.md` guarda **só a versão atual**:

```
version: X.Y.Z

- o que mudou nesta versão
```

As versões anteriores não ficam no arquivo: o `git log -p CHANGELOG.md` as
guarda. Todo PR sobe o `VERSION` e reescreve o `CHANGELOG.md` com as mudanças
daquela versão. O `docs.test.ts` da raiz falha quando o número não é `X.Y.Z`,
quando a primeira linha do changelog não é `version: ` com o mesmo número, ou
quando o arquivo guarda mais de uma versão.

# Que número sobe

Enquanto o dailly está em `0.x`, uma quebra sobe o MINOR:

| Sobe | Quando |
|------|--------|
| MINOR | algo que funcionava precisa da mão do dono de novo: uma rota da API muda de forma, uma migration que um banco antigo precisa rodar, um alvo do `Makefile` renomeado ou removido, uma variável nova obrigatória no `.env` |
| PATCH | uma feature, um alvo, um doc, uma correção |

O `1.0.0` é decisão do dono. Dali em diante vale a regra de sempre: MAJOR
quebra, MINOR acrescenta, PATCH corrige.

# O que vai no changelog

Uma linha por mudança, em PT-BR, começando pelo que a pessoa percebe e não pelo
arquivo que mudou, com o número do PR no fim (`(#17)`). Dívida e refatoração
entram numa linha só, no fim. A página da feature em
[Features](/features/index.md) leva o detalhe; o changelog leva o que mudou.

[^semver]: Versionamento Semântico 2.0.0
