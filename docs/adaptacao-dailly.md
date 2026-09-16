# Adaptação — o que as referências significam dentro do dailly

- **Data:** 2026-09-15
- **Origem das referências:** projeto `rangrig`, hoje **descontinuado**. Os
  documentos foram migrados para cá sem alteração; este repositório é a **única
  fonte da verdade** — não existe mais um original a consultar.

As referências em `docs/` foram escritas antes do dailly existir e assumem um app
construído do zero. Este documento é a ponte: **o que continua valendo
literalmente, o que morreu, e o que ainda precisa ser decidido.** Quem for
implementar lê este arquivo primeiro; sem ele, as ADRs parecem contradizer o
código que já existe.

---

## A decisão que ancora todas as outras

> **O whiteboard é o corpo da Entry — não a Entry.**

Uma entrada do Daily Log é o registro descrito na ADR 0002 (id, `occurredAt`,
`createdAt`, labels, props). Seu campo `body` é markdown, e é esse markdown que o
`WhiteboardDocument` edita e devolve.

```
Entry {
  id, occurredAt, createdAt, updatedAt,   ← metadado: SQLite
  labelIds[], props{},                     ← metadado: SQLite
  body: string                             ← WhiteboardDocument.toMarkdown()
}
```

Consequência imediata: **o credo do dailly ("o modelo *é* markdown") vale para o
corpo, não para a entrada.** Labels e propriedades continuam ao lado do markdown,
como colunas e JSON, exatamente como a ADR 0002 decidiu. Elas não viram sintaxe
de bloco, e o `BlockRegistry` não precisa ser estendido para suportá-las.

O seam já existe no core e não precisa ser construído:

```ts
// persistir
const body = doc.toMarkdown()
// restaurar
doc.setMarkdown(entry.body)
```

---

## Transfere intacto

| Referência | Por que continua valendo |
|---|---|
| **ADR 0001** — camadas, ports, Processor, local-first | O dailly hoje é `core` puro + adapters; é a mesma forma. As ports entram por cima, sem conflito |
| **ADR 0002** — data layer inteira | `Entry.body: string` markdown encaixa em `toMarkdown()` sem emenda. Schema, `json_extract`, `user_version`, UUID: tudo vale |
| **ADR 0004** — BYOK, port `Summarizer` | Independente de UI e de editor |
| **ADR 0005** — backup/restore | Continua pós-MVP, status inalterado |
| **`mvp.md`** — comportamentos | Todos válidos. O editor mudou; o que o usuário observa, não |
| **`roadmap.md`** — ordenação de fases | A ordenação continua correta (ver ressalva na Fase 1 abaixo) |

---

## Superseded pelo dailly

### ADR 0003 — a decisão de editor

A ADR 0003 decide *"Markdown no corpo exige um editor/renderizador; começar
simples (textarea + render) e evoluir se necessário."*

**Isso está resolvido, e muito além do que a ADR previa.** O dailly já entrega
edição em blocos no estilo Notion, com atalhos de markdown, aninhamento, colapso
e round-trip testado. A linha da ADR 0003 sobre textarea deve ser lida como
histórica.

Efeito no roadmap: a Fase 1 lista "UI Daily Log mínima (editor markdown +
timeline)". **Metade dessa unidade já está pronta** — o editor existe. O que
falta na Fase 1 é a timeline e a persistência.

### `roadmap.md` — Fase 3

A Fase 3 lista como unidade *"persistência da chave no keychain do OS"*. Isso é
**mecanismo, não decisão**, e depende de um alvo que ainda não foi escolhido
(§2 abaixo). Leia a unidade como: adapter da port `SecretStore`, mecanismo a
definir. O critério de pronto da fase ("sobrevive ao reinício, nunca aparece no
SQLite") continua válido sem mudança.

---

## Decisões novas exigidas (nenhuma tomada ainda)

### 1. Qual adapter renderiza as telas que não são o whiteboard

O whiteboard tem seu adapter DOM vanilla. Mas o produto precisa de **timeline,
filtros, gestão de labels e propriedades, Settings e Analyse** — telas de
formulário e lista, que é exatamente o que a ADR 0003 resolveria com React +
Tailwind + shadcn/ui + TanStack Query.

O README do dailly antecipa isso sem decidir: *"quando você escolher
React/Svelte/Solid, só o adapter é reescrito"*. Então não há contradição — há uma
escolha em aberto, com um custo concreto de cada lado:

- **Continuar vanilla**: o projeto mantém **zero dependências de runtime** (hoje
  só `vite`, `vitest`, `typescript`, `jsdom`, `@types/node` em devDependencies). Preço: formulários,
  dialogs, toasts e estados de loading/erro escritos à mão — precisamente o
  trabalho que a ADR 0003 queria evitar.
- **Adotar a ADR 0003**: ganha shadcn/ui e TanStack Query prontos. Preço:
  reescrever o adapter DOM em React e trazer React + Tailwind + Router + Query
  para um projeto que hoje não tem nenhuma dependência de runtime.

Decidir antes da Fase 2, que é quando as telas de formulário aparecem. A
[ADR 0006](adrs/0006-modularizacao-frontend.md) **não** toma essa decisão — ela
só garante que tomá-la depois não obrigue a remexer no core: cada módulo tem seu
próprio `ui/`, e o contrato de montagem está isolado em `shared/dom-shell.ts`.

### 2. Alvo de execução — ~~em aberto~~ decidido pela [ADR 0007](adrs/0007-api-local-e-tempo.md)

**Esta seção estava errada e a correção importa.** Ela dizia que nada nas fases
1–2 forçava a decisão e que ela podia cair antes da Fase 3. Mas a primeira
unidade da Fase 1 no `roadmap.md` era o próprio shell Tauri, com AppImage no
critério de pronto — os dois documentos não podiam estar certos, e quem seguisse
esta seção começaria pelo caminho errado.

A ADR 0007 resolve: o SQLite passa a ser acessado por uma **API local em
Fastify/TypeScript**, rodando em `127.0.0.1` na máquina do usuário. Isso reverte
a rejeição explícita a backend HTTP da ADR 0001 e preserva o local-first — os
dados continuam no arquivo do usuário.

O shell foi decidido logo depois pela [ADR 0008](adrs/0008-electron-como-shell.md):
**Electron**, alvo AppImage. Com ele o processo principal já é Node, o Fastify
roda dentro dele e não existe sidecar — e o motor de renderização fica fixo, o
que importa porque o whiteboard tem um workaround de `contenteditable` escrito
contra o Chrome.

### 3. Normalização vs. `updated_at`

Lacuna que só existe por causa do dailly, e que se soma às da auditoria.

O `toMarkdown()` **normaliza**. Isto está verificado em
`app/src/capabilities/whiteboard/core/serialize.test.ts`, não inferido:

| Entrada do usuário | Vira |
|---|---|
| `- [ ] a` / `* [x] b` | `[] a` / `[x] b` |
| `* a` / `+ b` | `- a` / `- b` |
| `5. a` / `9. b` / `3) c` | `1. a` / `2. b` / `3. c` |
| indentação com tab | dois espaços por nível |
| linha em branco | desaparece |

Ou seja, `Entry.body` não é fiel ao que o usuário digitou — é a forma
normalizada. A idempotência testada (`serialize(parse(md)) === md`) vale para
fonte **já normalizada**; a primeira serialização de uma fonte crua altera o
texto.

Isso é observável e não está decidido: **abrir uma entrada e salvá-la sem editar
nada pode alterar o `body` e, portanto, bater o `updated_at`.** O `mvp.md` diz
que editar atualiza `updated_at`, mas não diz o que conta como edição. Duas
saídas: normalizar na entrada (uma vez, na criação, e aí salvar é no-op) ou
comparar markdown normalizado antes de gravar.

---

## Ordem de leitura sugerida

1. Este arquivo
2. `mvp.md` — o que o produto faz
3. `auditoria-lacunas.md` — o que ainda não está decidido (leia antes de codar)
4. `adrs/0002-data-layer.md` — o contrato de dados
5. `roadmap.md` — a ordem de execução
6. Demais ADRs conforme a fase
