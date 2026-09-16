# ADR 0002 — Data Layer

- **Status:** Aceito
- **Data:** 2026-07-24
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001 — Arquitetura Geral](0001-arquitetura-geral.md)

## Contexto

A camada de dados precisa atender simultaneamente a três exigências definidas na
ADR 0001:

1. **Local-first** com SQLite, usuário dono dos dados.
2. **Opção remota** por troca de adapter, sem mudar o domínio.
3. **Propriedades e labels criados livremente** pelo usuário (schema flexível).

Além disso, o padrão **Processor** exige persistir não só o material cru (entries)
mas também as **materializações** produzidas por módulos como o Analyse.

## Decisão

### 1. O contrato do domínio vem primeiro, não o schema

A fonte da verdade é a **interface do repositório**, não a tabela SQL. Em
produção há **uma única** implementação — SQLite; nos testes, uma implementação
em memória. O port existe por testabilidade e limpeza de camadas, **não** para
suportar um backend remoto (não há um — ver ADR 0001).

```ts
// domain/ports/entry-repository.ts
export interface EntryFilter {
  from?: string;          // ISO date (inclusive)
  to?: string;            // ISO date (inclusive)
  labelIds?: string[];    // OR entre labels
  props?: Record<string, unknown>; // match por chave/valor de propriedade
}

export interface EntryRepository {
  create(input: NewEntry): Promise<Entry>; // ← ver Emenda 1, ao fim
  update(id: string, patch: Partial<NewEntry>): Promise<Entry>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Entry | null>;
  list(filter: EntryFilter): Promise<Entry[]>;
}

export interface LabelRepository {
  create(input: NewLabel): Promise<Label>;
  update(id: string, patch: Partial<NewLabel>): Promise<Label>;
  delete(id: string): Promise<void>;
  list(): Promise<Label[]>;
}

export interface MaterializationRepository {
  save(input: NewMaterialization): Promise<Materialization>;
  list(filter: { module?: string; periodType?: PeriodType }): Promise<Materialization[]>;
  getById(id: string): Promise<Materialization | null>;
}
```

Implementações:

- `SqliteEntryRepository` — traduz para SQL via `tauri-plugin-sql` (produção).
- `InMemoryEntryRepository` — usada nos testes de use-case e nos testes de
  contrato do repositório.

A implementação é injetada no **composition root**, na inicialização do app.

### 2. Entidades do domínio

```ts
type ISODateTime = string; // UTC ISO-8601

interface Entry {
  id: string;             // UUID (não autoincrement)
  body: string;           // texto/markdown do registro
  occurredAt: ISODateTime;// quando o fato ocorreu (default: createdAt)
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  labelIds: string[];
  props: Record<string, unknown>; // propriedades livres do usuário
}

interface Label {
  id: string;             // UUID
  name: string;
  color: string | null;
}

interface PropertyDef {
  id: string;             // UUID
  name: string;           // chave da propriedade (única)
  type: 'text' | 'number' | 'boolean' | 'date';
}

type PeriodType = 'week' | 'month' | 'quadrimester';

interface Materialization {
  id: string;             // UUID
  module: string;         // ex.: "analyse"
  periodType: PeriodType;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  inputFilter: EntryFilter; // filtro que gerou a materialização (JSON)
  content: string;          // resultado (markdown)
  createdAt: ISODateTime;
}
```

### 3. Schema SQLite

```sql
-- Entradas do Daily Log
CREATE TABLE entries (
  id          TEXT PRIMARY KEY,          -- UUID
  body        TEXT NOT NULL,
  occurred_at TEXT NOT NULL,             -- ISO-8601 UTC
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  props       TEXT NOT NULL DEFAULT '{}' -- JSON: propriedades livres
);
CREATE INDEX idx_entries_occurred_at ON entries(occurred_at);

-- Labels criadas livremente
CREATE TABLE labels (
  id    TEXT PRIMARY KEY,                -- UUID
  name  TEXT NOT NULL UNIQUE,
  color TEXT
);

-- N:N entre entries e labels
CREATE TABLE entry_labels (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  PRIMARY KEY (entry_id, label_id)
);
CREATE INDEX idx_entry_labels_label ON entry_labels(label_id);

-- Definições de propriedades conhecidas (autocomplete/tipagem)
CREATE TABLE property_defs (
  id   TEXT PRIMARY KEY,                 -- UUID
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('text','number','boolean','date'))
);

-- Materializações produzidas por Processors (Analyse, futuros)
CREATE TABLE materializations (
  id           TEXT PRIMARY KEY,         -- UUID
  module       TEXT NOT NULL,
  period_type  TEXT NOT NULL CHECK (period_type IN ('week','month','quadrimester')),
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  input_filter TEXT NOT NULL DEFAULT '{}', -- JSON
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_materializations_module ON materializations(module, period_type);
```

### 4. Propriedades livres: JSON + `property_defs`

Para propriedades definidas livremente pelo usuário, a decisão é **coluna JSON
`props` em `entries`** mais uma tabela leve `property_defs` (só para
autocomplete/tipagem das chaves conhecidas), em vez de EAV puro.

- **Por quê:** EAV puro (uma tabela `entry_property_values`) é rígido de manter e
  exige joins para reconstruir uma entry. JSON em `entries` mantém a entry
  coesa e o SQLite consulta com `json_extract(props, '$.chave')`.
- `property_defs` existe para a UI oferecer autocomplete e validar tipo; **não é
  obrigatório** que toda chave usada em `props` tenha um def (chaves ad-hoc são
  permitidas), mas a UI incentiva registrar.
- **Trade-off:** filtros por propriedade usam `json_extract` (não tão rápido
  quanto coluna indexada). No volume de um journal pessoal, é irrelevante. Se um
  dia doer, criar índices sobre expressões `json_extract` específicas.

### 5. Migrations & versionamento de schema

- Migrations versionadas e idempotentes, aplicadas na inicialização
  (`tauri-plugin-sql` suporta lista de migrations por versão).
- Uma tabela/`PRAGMA user_version` controla a versão aplicada.

### 6. Backup do arquivo e identificadores estáveis

O backup é **do arquivo SQLite inteiro** para um provider de nuvem (pós-MVP, ADR
0005) — cópia de arquivo, não sincronização de registros. Como a versão do schema
vive dentro do próprio arquivo (`user_version`), ao restaurar um backup as
migrations rodam normalmente para levá-lo à versão atual do app.

Decisões baratas hoje que evitam dor futura, mesmo sem sync:

- **`id` = UUID** gerado no cliente (não autoincrement) → id estável; sem colisão
  caso arquivos sejam restaurados ou mesclados manualmente.
- **`updated_at`** em todas as entidades mutáveis → útil para ordenação e para
  qualquer reconciliação manual futura.

**Não** há sync bidirecional (fila de mudanças, resolução de conflitos) — fora do
escopo. O backup é "último upload vence"; ver ADR 0005.

## Consequências

**Positivas**

- Domínio desacoplado da persistência; testes usam repositório em memória.
- Uma única implementação de produção — menos superfície para manter.
- Schema flexível para labels/propriedades sem migrations a cada nova chave.
- Materializações persistidas habilitam o padrão Processor e o encadeamento
  entre módulos.
- Backup por arquivo é trivial de implementar sobre qualquer `StorageProvider`.

**Negativas / trade-offs**

- Filtros por propriedade via `json_extract` são menos performáticos que colunas
  dedicadas (aceitável no volume-alvo).
- Chaves de propriedade ad-hoc sem `property_def` podem gerar inconsistência de
  tipos; mitigado por incentivo da UI a registrar defs.
- Backup por arquivo inteiro não suporta uso concorrente em dois dispositivos
  (último upload sobrescreve) — limitação assumida do modelo single-device.

## Emendas

### Emenda 1 (2026-09-16) — `create` recebe uma `Entry` pronta, não uma `NewEntry`

A interface acima foi escrita quando o repositório era `tauri-plugin-sql`
rodando dentro do próprio app: uma chamada de função, um processo, um adapter.
A [ADR 0007](0007-api-local-e-tempo.md) pôs uma fronteira HTTP no meio, e os
use-cases ficaram do lado do renderer — o `HttpEntryRepository` que o roadmap
lista na `ui/` só faz sentido assim, e o §6 desta ADR já dizia "`id` = UUID
gerado no cliente".

Com `create(input: NewEntry)`, **todo adapter** teria de cunhar id e carimbar
`createdAt`/`updatedAt`. Ou essa lógica se duplica por adapter, ou ela migra
para o servidor — e aí o id deixa de ser gerado no cliente, contrariando o §6.

Então a assinatura implementada é:

```ts
create(entry: Entry): Promise<Entry>
```

O use-case `createEntry` monta o registro inteiro — id, os dois timestamps, e o
corpo já normalizado — e o repositório guarda. O que atravessa o fio é uma
`Entry` completa.

**O que o servidor ainda deve:** validação. Ele é alcançável de fora do domínio,
então rejeita corpo vazio, timestamp malformado e id que não é UUID, com 400.
Guardar a loja não é refazer o domínio.

O resto desta ADR fica de pé: entidades, schema, `json_extract`, `user_version`,
UUID e a razão de o port existir. `NewEntry` continua existindo — é o que o
**chamador** entrega ao use-case, e está definido em `packages/domain`.
