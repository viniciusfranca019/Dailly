# ADR 0009 — Topologia do workspace: `server`, `ui`, `desktop`, `packages`

- **Status:** Aceito
- **Data:** 2026-09-15
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0006](0006-modularizacao-frontend.md) (supersede os nomes)
  · [ADR 0007](0007-api-local-e-tempo.md) · [ADR 0008](0008-electron-como-shell.md)

## Contexto

A ADR 0007 tirou o domain do frontend e o pôs em `packages/`. A ADR 0008 trocou
Tauri por Electron, o que criou dois processos de verdade em vez de um app com
sidecar. Juntas, elas invalidaram os nomes que a ADR 0006 tinha escolhido — e a
invalidação é literal, porque a 0006 justificou o nome assim:

> "O diretório se chama `app/` e não `ui/` porque `modules/` guarda domain, e vai
> guardar ports e use-cases na Fase 1."

Isso deixou de ser verdade duas decisões depois.

## Decisão

```
dailly/
  packages/
    domain/       Entry · Label · ports · use-cases · Clock
    periods/      instante + zona → dia/semana/mês/quadrimestre
  server/         Fastify · SqliteEntryRepository · migrations
  ui/             renderer: whiteboard · timeline · HttpEntryRepository
  desktop/        Electron main: janela + createServer() + AppImage
```

**Hoje só `ui/` existe.** Os outros três nascem na Fase 1; estão aqui porque a
decisão é sobre a forma, não sobre o cronograma.

### Por que os nomes

**`server/`, não `api/`** — pelo mesmo critério que matou o `ui/` original: o
diretório não guarda só a API. Guarda `SqliteEntryRepository`, as migrations e o
composition root do processo. `api/` nomeia a superfície; `server/` nomeia a
coisa.

**`ui/`, não `app/`** — a premissa que batizou `app/` morreu. Domain foi para
`packages/`, persistência foi para `server/`, e o que sobra é renderer: UI,
whiteboard, cliente HTTP. Não é voltar atrás; é o nome voltar a ser verdade.

**`desktop/`, não `electron/`** — o shell mudou duas vezes num dia. Nome que
amarra ao shell nasce com data de validade.

### A separação é um teste, não uma promessa

A ADR 0008 manteve HTTP entre `ui/` e `server/` porque a fronteira seria
testável de fora. Isso só se paga se `server/` **de fato** rodar sozinho, então
a regra é executável:

> `server/` tem um teste de integração que sobe o Fastify **sem Electron**, bate
> num endpoint e derruba.

Enquanto ele passar, a separabilidade é fato. Se um dia não puder mais ser
escrito, a separação morreu e HTTP deixou de comprar o que custa — e aí o
colapso para IPC é conclusão, não debate. Mesma mecânica do teste de
arquitetura: a regra vive no CI, não na prosa.

### `src/app/` vira `src/shell/`, e o alias `@app` morre

Dentro de `ui/`, o composition root passa a ser `src/shell/` — `ui/src/app/`
leria mal, e `shell` é o que a coisa é. O arquivo `shell.ts` vira `mount.ts`
para não repetir o nome do diretório.

O alias `@app` some sem substituto. Ele tinha dois consumidores, e os dois eram
testes **no mesmo diretório** importando o vizinho — alias para nada. E a
ausência é a regra: **ninguém fora de `shell/` deveria importar `shell/`**, então
não existe caminho bonito para fazê-lo. O teste de arquitetura passou a procurar
qualquer caminho que entre ali, o que também pega o climb relativo que uma
checagem de alias não enxergaria.

## Consequências

**Positivas**

- Cada nome diz o que o diretório é, e nenhum amarra ao shell da semana.
- A separabilidade de `server/` para de ser intenção e vira verificação.
- Um alias a menos, e a regra que ele sugeria virou regra de verdade.

**Negativas / trade-offs**

- **Terceiro rename do mesmo diretório em um dia** (`ui` → `app` → `ui`). Barato
  porque nada externo aponta para lá e a história é curta — e é exatamente por
  isso que se faz agora.
- Cinco diretórios de topo para um diário pessoal. Cada um mapeia uma fronteira
  real (dois processos do SO, um alvo de empacotamento, código atravessando
  processo), mas é mais estrutura do que o produto aparenta precisar.
- `packages/domain` e `packages/periods` poderiam ser um pacote só. Ficam
  separados porque `periods` não conhece `Entry` — é capacidade pelo critério
  que a ADR 0006 escreveu, e `domain` não é.

## Alternativas consideradas

- **Tudo em `app/`, com IPC no lugar de HTTP** — menos partes móveis, sem porta
  aberta na máquina do usuário, e o Electron reabre o argumento original da
  ADR 0001 contra ter servidor. Rejeitado em favor da fronteira testável de
  fora, mas registrado como a alternativa coerente: se o teste de integração de
  `server/` deixar de existir, este é o destino.
- **`api/`** — descreve a superfície, não o conteúdo. Mesmo erro do `ui/`
  original, com sinal trocado.
- **`renderer/` e `main/`** (vocabulário do Electron) — precisos e legíveis para
  quem conhece Electron. Rejeitados por amarrar ao shell.
- **Manter `@app` como alias** — a checagem de fronteira seria um prefixo em vez
  de um regex de caminho. Rejeitado: o alias convidava exatamente o import que a
  regra proíbe.
