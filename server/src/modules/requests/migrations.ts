import type { Migration } from '../../shell/module.js'

/**
 * A fatia do módulo Requests no `user_version`.
 *
 * O envelope é genérico de propósito ([ADR 0011](../../../../docs/adrs/0011-requests-modulo-e-execucao.md)):
 * `protocol` mais `spec` como JSON. Colunas com cara de HTTP — `method`,
 * `url`, `headers` — significariam uma migration por protocolo novo, e a
 * validação desse JSON é o que o driver puro já sabe fazer.
 *
 * O preço, dito uma vez: busca por conteúdo de request vira varredura, porque
 * o `spec` é opaco para o SQL. Numa coleção pessoal de dezenas de requests
 * isso não é preço nenhum; a revisitar se um dia forem milhares.
 *
 * **O número é 2 e foi alocado agora.** O `entries` o tinha reservado num
 * comentário para a Fase 2, e reservar não é tomar: o `user_version` é global,
 * e quem aterrissa primeiro leva. O comentário de lá deixou de nomear número.
 */
export const REQUESTS_MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    up: `
      CREATE TABLE request_folders (
        id        TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES request_folders(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE requests (
        id        TEXT PRIMARY KEY,
        folder_id TEXT REFERENCES request_folders(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        protocol  TEXT NOT NULL,
        spec      TEXT NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_requests_folder ON requests(folder_id);
      CREATE INDEX idx_request_folders_parent ON request_folders(parent_id);
    `,
  },
]
