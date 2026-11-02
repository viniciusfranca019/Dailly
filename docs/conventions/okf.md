---
type: Convention
title: OKF neste bundle
description: Tipos, campos de frontmatter e regras de escrita dos docs do dailly.
tags: [docs, okf]
status: stable
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:10:00-03:00 }
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
    title: Open Knowledge Format v0.2
---

# Regra

O `docs/` é um bundle OKF v0.2,[^okf-spec] no mesmo formato do bundle do
Workstation. O spec fixa só o `type` e alguns campos padrão; o resto é de quem
produz o bundle. **Este conceito é o registro deste bundle**: um tipo ou campo
novo entra primeiro aqui, e só depois num documento. O `docs.test.ts` da raiz
lê a tabela de tipos daqui e recusa um conceito cujo `type` não esteja nela.

# Estrutura

- Todo `.md` é um conceito com frontmatter e `type`, exceto os reservados
  `index.md` (listagem da pasta, sem frontmatter) e `log.md` (histórico datado,
  o mais recente primeiro, só na raiz).
- Um conceito por arquivo. O caminho sem `.md` é a identidade do conceito, por
  isso renomear quebra os links.
- Links absolutos a partir da raiz do bundle: `[Módulos](/conventions/modules.md)`.
  Sem `[[wikilinks]]`, que não são OKF, e sem caminho relativo. Um link para
  código do repo, fora do bundle, vai como texto em código (`` `server/src/modules.ts` ``),
  porque o bundle não enxerga o repo.
- Uma pasta nova ganha um `index.md`, e a entrada dela vai no `index.md` da pasta
  acima; todo conceito aparece no `index.md` da própria pasta.
- Uma mudança relevante ganha uma linha em `/log.md`.
- As chaves do frontmatter seguem o spec, em inglês. O conteúdo é em PT-BR.

# Tipos

| `type`       | Para quê                                                    | Onde           |
|--------------|-------------------------------------------------------------|----------------|
| `Convention` | Regra que guia uma decisão no código: arquitetura, módulos, versão | `conventions/` |
| `Feature`    | O que uma feature entregue faz, como a pessoa a vê, e onde mora | `features/`    |

Não há tipo `ADR`: uma decisão de arquitetura entra como seção de
[Arquitetura](/conventions/architecture.md), com o porquê e o que foi descartado.
Uma pasta só é criada quando o primeiro documento dela existir.

# Campos

| Campo         | Obrigatório | Valor                                                        |
|---------------|-------------|--------------------------------------------------------------|
| `type`        | sim         | um dos tipos acima                                           |
| `title`       | sim         | nome legível                                                 |
| `description` | sim         | uma frase; é ela que entra no `index.md`                     |
| `tags`        | não         | lista curta, em minúsculas                                   |
| `status`      | não         | `draft` \| `stable` \| `deprecated`; ausente = `stable`      |
| `generated`   | sim         | `{ by: <ator>, at: <ISO 8601 com fuso> }`: quem escreveu o conteúdo atual |
| `verified`    | não         | `{ by: human:vinicius, at: ... }`: só depois da revisão do dono |
| `since`       | não         | a versão do `VERSION` em que a feature chegou (`0.1.0`), só em `Feature` |
| `sources`     | não         | `[{ id, resource, title }]` para o que veio de fora          |

Atores: `human:vinicius` para o dono, `<agente>/<modelo>` para agentes (por
exemplo `regulus/claude-opus-5-5`), `process:<id>` para jobs.

# Confiança

- Um agente que escreve ou altera um conceito atualiza `generated` e **nunca**
  escreve `verified`. Quem verifica é o dono.
- Um conceito sem `verified` é rascunho de agente: leia como sugestão, não como regra.
- Uma convenção substituída vira `status: deprecated` e aponta para a que a
  substitui. Não é apagada.

# Quando um doc muda

- Uma feature nova, ou uma mudança no que ela faz, atualiza a página dela em
  `features/` no mesmo PR, e o `CHANGELOG.md` diz o que mudou.
- Uma decisão de arquitetura nova entra como seção em
  [Arquitetura](/conventions/architecture.md) no mesmo PR que a aplica.

[^okf-spec]: Open Knowledge Format v0.2
