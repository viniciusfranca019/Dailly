# ADR 0005 — Backup & Restore (providers de nuvem)

- **Status:** Proposto (pós-MVP — não implementado no MVP)
- **Data:** 2026-07-24
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001 — Arquitetura Geral](0001-arquitetura-geral.md),
  [ADR 0002 — Data Layer](0002-data-layer.md)

## Contexto

O app é local-first puro: os dados vivem em um arquivo SQLite na máquina do
usuário (ADR 0001). O **único** uso remoto desejado é dar ao usuário uma forma de
**fazer backup e restaurar** esse arquivo em um provider de nuvem da escolha dele
(Google Drive, iCloud, etc.).

Fluxo imaginado: o usuário **faz login no provider**, **seleciona o arquivo
SQLite** (para subir um backup ou baixar um existente). Cada provider tem seu
próprio método de auth e sua própria forma de selecionar/localizar o arquivo.

**Isto é pós-MVP.** Nenhum provider será implementado agora. Esta ADR fixa o
desenho para que a decisão futura não exija retrabalho no núcleo.

## Decisão

### É backup de arquivo, não sincronização

A operação copia o **arquivo SQLite inteiro** para/da nuvem. Não há merge de
registros, fila de mudanças nem resolução de conflitos. Semântica **"último
upload vence"**. Isso mantém o modelo simples e coerente com single-device.

### Port `StorageProvider`

Cada provider é um adapter atrás de uma interface comum:

```ts
// domain/ports/storage-provider.ts
export interface RemoteFile {
  id: string;         // identificador no provider
  name: string;
  modifiedAt: string; // ISO
  size: number;
}

export interface StorageProvider {
  readonly id: string;                 // "gdrive" | "icloud" | ...
  authenticate(): Promise<void>;       // fluxo de login específico do provider
  isAuthenticated(): Promise<boolean>;
  listCandidates(): Promise<RemoteFile[]>;      // arquivos .sqlite visíveis
  upload(localPath: string, target?: RemoteFile): Promise<RemoteFile>; // backup
  download(file: RemoteFile, localPath: string): Promise<void>;        // restore
}
```

### Backup / restore como use-cases

- **Backup**: fecha/flush do SQLite (garantir consistência do arquivo, ex.:
  `VACUUM INTO` para uma cópia estável) → `upload`.
- **Restore**: `download` para um arquivo temporário → validar que é um SQLite
  válido e compatível → substituir o arquivo ativo → rodar migrations
  (`user_version`) para levar à versão atual do app (ADR 0002).

### Auth e credenciais

- Cada provider implementa seu fluxo (tipicamente **OAuth**); tokens ficam no
  **keychain do SO**, como as chaves de IA (ADR 0004), nunca em texto plano.
- A seleção de arquivo respeita o modelo de cada provider (picker nativo, listagem
  via API, etc.), encapsulada no adapter.

### Integridade

- Antes de sobrescrever o arquivo ativo em um restore, **guardar um backup local
  automático** do estado atual (rollback se o restore falhar).
- Validar o arquivo baixado (abertura + `PRAGMA integrity_check`) antes de adotar.

## Consequências

**Positivas**

- Dá durabilidade/portabilidade dos dados sem abrir mão do local-first.
- Núcleo não muda: backup/restore vive na borda, sobre a port `StorageProvider`.
- Adicionar um provider é escrever um adapter, sem tocar em domínio/UI.

**Negativas / trade-offs**

- "Último upload vence" pode causar **perda de dados** se o usuário editar em dois
  dispositivos e subir o mais antigo por último; precisa ser comunicado na UI
  (mostrar `modifiedAt` do backup remoto vs local antes de sobrescrever).
- Cada provider é um adapter com auth própria — custo de manutenção por provider.
- OAuth em app desktop (Tauri) exige tratar redirect/loopback — complexidade
  concentrada, mas real.

## Alternativas consideradas

- **Sync bidirecional com resolução de conflitos** — resolveria multi-device, mas
  é ordens de magnitude mais complexo (versionamento, CRDT/merge). Rejeitado para
  o horizonte atual; não é o que o usuário pediu.
- **Backup só local (exportar/importar arquivo manualmente)** — trivial e pode
  coexistir como fallback, mas não atende ao desejo de nuvem por provider.
- **Nosso próprio storage/servidor de backup** — reintroduziria backend e custo;
  contra o local-first/BYOK. Rejeitado.
