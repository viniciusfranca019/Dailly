# ADR 0001 — Arquitetura Geral

- **Status:** Aceito
- **Data:** 2026-07-24
- **Decisores:** Vinicius

## Contexto

O projeto é um **daily journal & log** cujo objetivo central é oferecer um lugar
para registrar insights, pensamentos, ideias e atividades, e então usar IA (ou
outros artifícios) para filtrar esse material e transformá-lo em materializações
(resumos, análises, e futuros artefatos).

Módulos do MVP:

- **Daily Log** — interface para registrar entradas relevantes do dia, com
  labels e propriedades criadas livremente pelo usuário.
- **Analyse** — gera análises e resumos de um período (semana, mês, quadrimestre)
  a partir do material do Daily Log e das seleções de labels/propriedades.

Observação estruturante: o **Analyse opera sobre o material produzido pelo Daily
Log**, e esse padrão (um módulo consome o material de outro e produz um novo
artefato) deve se repetir para módulos futuros.

Restrições e preferências já decididas:

1. Banco de dados **local (SQLite)** — o usuário é dono dos próprios dados. O
   acesso é mediado por uma port (`EntryRepository`), mas apenas por
   testabilidade e limpeza de camadas — **não** para um banco remoto.
2. **Local-first puro** — sem backend remoto e sem uso remoto de dados. O único
   uso remoto previsto é **backup/restore do arquivo SQLite** em um provider de
   nuvem escolhido pelo usuário (Google Drive, iCloud, etc.), e isso é
   **pós-MVP** — nenhum provider será implementado agora. Ver
   [ADR 0005 — Backup & Restore](0005-backup-restore.md).
3. **IA em modelo BYOK** (Bring Your Own Key): o usuário escolhe o provider e o
   modelo usados pelos Processors, autenticando-se com a própria chave. Ver
   [ADR 0004 — AI Providers (BYOK)](0004-ai-providers-byok.md).
4. Distribuição como artefato desktop único (ex.: **AppImage**).
5. Um único repositório (monorepo).
6. Sem SSR; front simples de manter e testar.

## Decisão

### Shell / empacotamento: Tauri 2.x

- Gera **AppImage** nativamente (`tauri build`), além de outros alvos desktop.
- Binário pequeno (~5–10 MB) contra ~100 MB+ do Electron.
- Embute **SQLite** via `tauri-plugin-sql` (ou `sqlx` no core Rust).
- O frontend roda em um webview: é **web comum**. As únicas chamadas de rede do
  MVP são para os **providers de IA** (BYOK, ADR 0004); não há backend próprio.

Consequência direta: **não há processo backend HTTP, nem local nem remoto.** Um
servidor existe para servir múltiplos clientes pela rede; aqui o cliente é a
própria máquina, ao lado do SQLite. Introduzir um servidor só adicionaria
processo, porta, serialização e runtime a empacotar — contra o objetivo do
AppImage e contra a decisão local-first. Toda a lógica (domínio, use-cases,
Processors) roda dentro do próprio app.

### Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui

- Ecossistema maior e melhor tooling de teste (Vitest + Testing Library).
- shadcn/ui entrega componentes prontos e editáveis (formulários, listas,
  dialogs), adequados a um app de produtividade.
- Sem SSR — SPA servida dentro do webview do Tauri.

### IA: BYOK via port `Summarizer`

- Os Processors consomem IA através da interface `Summarizer`. O usuário
  **escolhe o provider e o modelo** e fornece a própria chave (BYOK). Cada
  provider tem seu método de auth e seu adapter (`AnthropicSummarizer`,
  `OpenAiSummarizer`, …). Detalhes em [ADR 0004](0004-ai-providers-byok.md).
- Chaves são guardadas de forma segura no keychain do SO (via plugin do Tauri),
  nunca em texto plano no SQLite.
- Se a análise ficar pesada (embeddings/RAG/modelo local), Tauri suporta
  **sidecar binary** — aí entra um processo Python empacotado junto, apenas para
  esse pipeline, sem virar um servidor.

### Arquitetura em camadas (ports & adapters)

```
┌─────────────────────────────────────────────┐
│  UI (React + shadcn/ui)                       │
│   módulos: DailyLog · Analyse · (futuros…)    │
├─────────────────────────────────────────────┤
│  Application / Use-cases                      │
│   createEntry · queryEntries · runAnalysis    │
├─────────────────────────────────────────────┤
│  Domain (core)                                │
│   Entry · Label · Property · Materialization  │
│   Ports:  EntryRepository                      │
│           LabelRepository                      │
│           Summarizer (LLM, BYOK)               │
│           StorageProvider (backup, pós-MVP)     │
│           Clock                                │
├─────────────────────────────────────────────┤
│  Adapters                                     │
│   SqliteEntryRepository  (local, único)        │
│   InMemoryRepository     (testes)              │
│   AnthropicSummarizer · OpenAiSummarizer · …   │
│   GDriveStorage · ICloudStorage (pós-MVP)      │
└─────────────────────────────────────────────┘
```

A **UI e os use-cases dependem apenas das interfaces (ports)**, nunca de uma
implementação concreta.

### Conceito de Processor (extensibilidade dos módulos)

Para materializar o padrão "um módulo consome material de outro":

> **Processor**: recebe *entries filtradas* (por período + labels + propriedades)
> → produz uma **Materialization** que é persistida.

- **Daily Log** — escreve/lê `Entry` cru.
- **Analyse** — um Processor: filtro (semana/mês/quadrimestre + labels) →
  `Summarizer` → salva `Materialization`.
- **Módulos futuros** — outros Processors, podendo consumir Materializations de
  outros (encadeamento), sem reescrever o núcleo.

### Dados sempre locais; remoto = apenas backup do arquivo

Não há origem de dados remota. O `EntryRepository` tem uma única implementação de
produção — `SqliteEntryRepository` — e uma `InMemoryRepository` para testes. O
port continua existindo por **testabilidade** e limpeza de camadas, não para
suportar um backend.

O **único** uso remoto previsto (pós-MVP) é **backup/restore do arquivo SQLite**
em um provider de nuvem escolhido pelo usuário: ele faz login no provider,
seleciona o arquivo e sobe/baixa o `.sqlite` inteiro. É cópia de arquivo, não
sincronização de dados. Modelado pela port `StorageProvider`, com um adapter por
provider (cada um com seu método de auth). Ver
[ADR 0005 — Backup & Restore](0005-backup-restore.md).

### Monorepo

Um único repositório. Com Tauri isso é natural: `src-tauri/` (core Rust) +
`src/` (frontend React) no mesmo projeto.

## Consequências

**Positivas**

- Distribuição desktop simples (AppImage) sem empacotar runtime de servidor.
- Local-first real; dados 100% sob controle do usuário, sem dependência de rede
  para operar (só a IA, opcional por Processor, sai para a rede).
- Arquitetura mais simples: uma única implementação de repositório, sem
  condicionais local/remoto espalhadas.
- BYOK evita custo/segredo de IA no app e dá liberdade de provider ao usuário.
- Núcleo de domínio testável isoladamente (ports mockáveis).
- Extensível por Processors para módulos futuros.

**Negativas / trade-offs**

- Introduz Rust no core (Tauri). Mitigado: a lógica de domínio vive em TS; o
  Rust fica majoritariamente na borda (plugins, sidecar).
- BYOK transfere ao usuário a obtenção/gestão da chave e o custo da IA; a UX de
  onboarding precisa deixar isso claro (ADR 0004).
- Backup por arquivo inteiro (pós-MVP) é simples, mas **não** resolve edição
  concorrente em duas máquinas — o último upload sobrescreve. Aceitável para uso
  pessoal single-device; documentado na ADR 0005.
- `Entry` usa **UUID** (não autoincrement) mesmo sem sync — id estável é boa
  prática barata e evita colisão caso o arquivo seja restaurado/mesclado à mão.

## Alternativas consideradas

- **Electron** — binário grande, mais consumo; rejeitado dado o objetivo de
  artefato leve.
- **Django (front + server no mesmo repo)** — framework de servidor web
  multiusuário; empurra na direção oposta do local-first/AppImage (empacotar
  runtime Python, servir HTTP). Rejeitado para este caso.
- **Backend HTTP (local ou remoto)** — processo e runtime extras a empacotar sem
  ganho para um app de máquina única e local-first. Rejeitado.
- **Adapter de dados remoto (sincronização)** — considerado antes; abandonado. O
  único remoto desejado é backup do arquivo, não uma fonte de dados. Rejeitado em
  favor de `StorageProvider` (ADR 0005).
- **PWA / web puro (SQLite via WASM)** — mais simples de distribuir, mas foge da
  decisão de distribuição desktop (AppImage). Rejeitado.
- **Vue** — alternativa viável; React escolhido por ecossistema e shadcn/ui.
