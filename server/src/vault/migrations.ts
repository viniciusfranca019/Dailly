import type { Migration } from '../shell/module.js'

/**
 * As tabelas do cofre (ADR 0013). Nada aqui é legível sem a DEK: `vault` guarda
 * só os parâmetros do scrypt e o sal, `vault_slots` as duas cópias cifradas da
 * DEK, e `secrets` os valores cifrados. Nomes e ambientes ficam em claro de
 * propósito — são o que a tela lista com o cofre trancado.
 */
export const VAULT_MIGRATIONS: readonly Migration[] = [
  {
    version: 3,
    up: `
      CREATE TABLE vault (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        kdf        TEXT NOT NULL,
        salt       BLOB NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE vault_slots (
        kind        TEXT PRIMARY KEY CHECK (kind IN ('sessao', 'recuperacao')),
        wrapped_dek BLOB NOT NULL,
        nonce       BLOB NOT NULL,
        tag         BLOB NOT NULL
      );

      CREATE TABLE secrets (
        environment TEXT NOT NULL,
        name        TEXT NOT NULL,
        ciphertext  BLOB NOT NULL,
        nonce       BLOB NOT NULL,
        tag         BLOB NOT NULL,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (environment, name)
      );
    `,
  },
]
