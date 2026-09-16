# ADR 0007 — API local, fuso e o contrato do tempo

- **Status:** Aceito · a seção de empacotamento foi **superseded** pela
  [ADR 0008](0008-electron-como-shell.md), que troca Tauri por Electron e
  elimina o sidecar
- **Data:** 2026-09-15
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001](0001-arquitetura-geral.md) (reverte em parte) ·
  [ADR 0002](0002-data-layer.md) · [ADR 0006](0006-modularizacao-frontend.md)
  (supersede a decisão de pacote único) · [auditoria-lacunas.md](../auditoria-lacunas.md)

## Contexto

A Fase 1 do roadmap não podia começar. Quatro coisas estavam abertas e cada uma
muda o que o usuário observa:

1. Onde o SQLite é acessado. A ADR 0001 decidiu Tauri com `tauri-plugin-sql` e
   **rejeitou por escrito** um backend HTTP.
2. Fuso horário (auditoria §1.1) — a lacuna mais cara, porque todo limite de
   período é construído sobre ela.
3. Quadrimestre e início de semana (§1.2, §1.3), nunca definidos.
4. O contrato do `Clock`, que aparece no diagrama da ADR 0001 e nunca foi
   escrito. O roadmap lista como "decidir antes da Fase 1".

Havia ainda uma contradição entre documentos: a `adaptacao-dailly.md` §2 dizia
que o alvo de execução podia esperar até a Fase 3, enquanto a primeira unidade
da Fase 1 no `roadmap.md` era justamente o shell Tauri, com AppImage no critério
de pronto. Esta ADR resolve a contradição decidindo.

## Decisão

### 1. O SQLite passa a ser acessado por uma API local (Fastify + TypeScript)

Isto **reverte** a decisão da ADR 0001:

> "Consequência direta: **não há processo backend HTTP, nem local nem remoto.**"

A API roda em `127.0.0.1`, na máquina do usuário, e sobe junto com o app.

**O local-first sobrevive** — e essa é a razão de a API ser local e não remota.
Os dados continuam num arquivo SQLite na máquina do usuário, que continua sendo
dono deles; a restrição §2 da ADR 0001 ("sem backend remoto e sem uso remoto de
dados") segue valendo ao pé da letra. O que a ADR 0001 rejeitava era o custo de
processo e empacotamento, não a exposição dos dados — e esse custo agora é
aceito conscientemente (ver Consequências).

### 2. Tempo

**Armazenamento não muda.** A ADR 0002 continua intacta: `ISODateTime` é
ISO-8601 em UTC, e `occurred_at` é gravado assim.

O fuso é **de apresentação e de recorte**, nunca de armazenamento:

| Questão | Decisão |
|---|---|
| Zona | variável de ambiente do processo da API, default **`UTC`** |
| Visibilidade | a UI **sempre** mostra qual zona está em uso, não só em Settings |
| Quadrimestre | jan–abr · mai–ago · set–dez (terços fixos do calendário) |
| Início da semana | **segunda-feira** (ISO-8601) |
| O que delimita período | **`occurredAt`**, não `createdAt` |

O início da semana não é preferência: o cenário "Resumo da semana" do `mvp.md`
usa 2026-07-20 a 2026-07-26, que é segunda a domingo. A decisão só torna
explícito o que o documento já praticava.

O quadrimestre é fixo e não móvel porque quadrimestre móvel a partir de uma data
arbitrária torna duas análises incomparáveis — e comparar períodos é o motivo de
o Analyse existir.

`occurredAt` delimita porque é "quando o fato ocorreu" e o Analyse resume fatos,
não digitação. Uma entrada escrita hoje sobre um fato do mês passado entra no
resumo do mês passado. Como `occurredAt` tem `createdAt` como default, o caso
comum não muda.

**"Env escolhida pelo usuário" tem um limite que vale registrar:** env é do
*processo*, não da sessão. Enquanto a API servir uma pessoa, está correto. Se um
dia servir mais de uma, fuso vira coluna, não variável de ambiente.

### 3. `Clock` não conhece fuso

```ts
/** Um instante. Sempre UTC, ISO-8601 com Z. */
export type ISODateTime = string

export interface Clock {
  now(): ISODateTime
}

export const systemClock: Clock = { now: () => new Date().toISOString() }
export const fixedClock = (at: ISODateTime): Clock => ({ now: () => at })
```

São duas perguntas diferentes, com dois donos:

- **`Clock`** responde *"que instante é agora"*. `createEntry` usa, e só.
- **A zona** responde *"a que dia de calendário este instante pertence"*. Usada
  ao agrupar a timeline e ao recortar período.

Misturar as duas é o que espalha o bug de fuso pelo código inteiro: todo lugar
que pede a hora passaria a precisar saber a zona, e uma hora alguém esquece.
Separadas, existe **um** ponto de conversão, e ele tem nome: a capacidade
`periods` (instante + zona → dia, semana, mês, quadrimestre), usada pelos dois
lados — o app agrupa, a API filtra.

`fixedClock` não é enfeite: sem ele, testar "entrada às 23:59 do dia 31" exige
mexer no relógio da máquina.

### 4. O domain é compartilhado, e o repo vira workspace

Com dois runtimes em TypeScript, o domain existe uma vez só:

```
dailly/
  packages/
    domain/      Entry · Label · PropertyDef · ports · use-cases
    periods/     instante + zona → dia/semana/mês/quadrimestre
  server/        Fastify · SqliteEntryRepository · composition root do servidor
  ui/            renderer · HttpEntryRepository · whiteboard
  desktop/       Electron main (ADR 0008)
```

Isto **supersede a decisão "pacote único" da ADR 0006**, que valia enquanto
havia um runtime só. A ADR 0006 previu a graduação e nomeou o gatilho; o gatilho
que disparou não é o que ela imaginou (um consumidor externo do whiteboard) e
sim outro: dois processos precisando do mesmo código.

~~**O whiteboard não vira pacote.** Só o app o consome, e o gatilho da ADR 0006
para ele continua não tendo disparado. Ele fica em `ui/src/capabilities/`.~~
**Emendado em 2026-09-16 — ver Emendas, ao fim.**

A regra de dependência da ADR 0006 sobrevive e ganha um andar: `packages/` não
importa de `server/` nem de `ui/`; `server/` e `ui/` importam `packages/`, nunca um
ao outro. O teste de arquitetura passa a cobrar isso.

## Consequências

**Positivas**

- Uma implementação de domain, não duas, e nenhum tipo gerado ou duplicado.
- `periods` serve app e API a partir do mesmo código, então "que dia é este
  instante" não pode divergir entre o que a timeline mostra e o que o filtro
  recorta — que é exatamente como o bug de fuso costuma se esconder.
- `Clock` injetável torna testável o comportamento de virada de dia.
- Local-first preservado; os dados não saem da máquina.

**Negativas / trade-offs**

- ~~**Empacotamento.** O runtime Node vai como sidecar do Tauri.~~
  **Superseded pela [ADR 0008](0008-electron-como-shell.md):** com Electron o
  processo principal já é Node, o Fastify roda dentro dele e não há sidecar. O
  AppImage volta a ser um artefato só.
- **Ciclo de vida.** Porta livre, subir e derrubar o processo junto do app, e o
  que fazer se a porta estiver ocupada. Nada disso existia antes.
- **Erro de rede onde não havia.** O que era chamada de função vira HTTP. A
  latência em localhost é irrelevante; a classe de erro não é, e a UI precisa
  tratá-la.
- **A ADR 0004 muda de mecanismo.** Com uma API, a chave BYOK pode morar lá em
  vez do keychain do SO. Isso fecha a lacuna §2.2 da auditoria por um caminho
  diferente do previsto — mas a decisão é da Fase 3, não desta ADR.
- **A ADR 0005 muda de dono.** "Copiar o arquivo `.sqlite`" passa a ser operação
  do servidor, não do usuário. Continua pós-MVP.
- Workspace traz `package.json` por pacote e versionamento interno — a cerimônia
  que a ADR 0006 tinha evitado de propósito.

## Pendências

- ~~O alvo Tauri/AppImage é herdado da ADR 0001.~~ **Fechado pela
  [ADR 0008](0008-electron-como-shell.md):** Electron, alvo AppImage.
- **Excluir uma `PropertyDef`** (auditoria §1.5), **reexecutar análise do mesmo
  período** (§1.6) e **combinação do `EntryFilter` entre dimensões** (§1.7)
  continuam abertas. Não são sobre tempo e não bloqueiam a Fase 1.

## Alternativas consideradas

- **Manter a ADR 0001 sem API** (use-cases dentro do app, `tauri-plugin-sql`) —
  um processo a menos e nenhum empacotamento extra. Rejeitado por decisão do
  autor, em favor de uma fronteira HTTP explícita entre domínio e UI.
- **API remota (self-hosted)** — daria multi-device, que a ADR 0005 dizia
  explicitamente não resolver. Rejeitado: mata o local-first, exige auth e
  deixa o app inutilizável sem rede.
- **Domain só na API, front como cliente burro** — mais simples, e os tipos
  seriam gerados do contrato (OpenAPI/zod). Rejeitado porque, com TypeScript dos
  dois lados, gerar o que se pode compartilhar é trabalho sem ganho.
- **`Clock` devolvendo `Date`** — objeto mutável, e a conversão para o que se
  persiste ficaria espalhada. `ISODateTime` é o que a ADR 0002 já grava.
- **`Clock` conhecendo a zona** — pareceria conveniente e espalharia a zona por
  todo chamador de hora. Rejeitado: um ponto de conversão, não N.

## Emendas

### Emenda 1 (2026-09-16) — o core do whiteboard vira pacote; o adapter não

A decisão acima dizia que o whiteboard não vira pacote, porque só o app o
consumia. Isso deixou de ser verdade por uma consequência desta própria ADR.

Esta ADR pôs markdown na entrada do domain: `createEntry` recebe o corpo, e a
decisão de **normalizar na criação** (`adaptacao-dailly.md` §3, fechada hoje)
coloca `parse` e `serialize` dentro do use-case. Com o core em
`ui/src/capabilities/`, `packages/domain` teria de importar do renderer — a seta
que a regra de dependência desta mesma seção proíbe.

A emenda é cirúrgica, e a fronteira é a que já existia:

- **`packages/whiteboard-core`** — modelo, parser, serializer, operações de
  edição. Sem DOM e sem framework, agora por compilador: o `tsconfig` do pacote
  não carrega a lib DOM.
- **`ui/src/capabilities/whiteboard/`** — o adapter DOM, que continua vanilla
  ([ADR 0010](0010-vue-no-renderer.md)) e continua na `ui/`, porque renderer é
  exatamente o que não se compartilha entre processos.

O `index.ts` que reexportava o core foi removido em vez de virar fachada: duas
portas para o mesmo modelo não são policiáveis por teste de arquitetura. Hoje
`@dailly/whiteboard-core` é o modelo e `@capabilities/whiteboard/dom` é o
renderer, e cada import diz em que camada entra.

A regra de dependência desta seção ganhou o teste que ela pedia:
`architecture.test.ts` na raiz do workspace, verificado quebrando de propósito —
`packages/` não importa de `ui/` nem de `server/`, e os dois não se importam.
