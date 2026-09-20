import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import { MIGRATIONS, migrate, type Migration } from './migrations.js'

/**
 * Abre um banco e leva o schema dele até o dia.
 *
 * Os pragmas não são decoração:
 *
 * - **WAL** deixa um leitor e um escritor coexistirem. Com um usuário desktop
 *   isso raramente tem contenção, mas a falha que ele evita — `SQLITE_BUSY`
 *   numa leitura enquanto uma escrita está em voo — é exatamente do tipo que
 *   aparece quando o app faz duas coisas ao mesmo tempo e nunca num teste.
 * - **`foreign_keys`** vem desligado por padrão no SQLite, e o schema da Fase 2
 *   (`entry_labels`, com `ON DELETE CASCADE`) depende dele. Ligar agora
 *   significa que no dia em que essas tabelas chegarem o comportamento já é o
 *   de verdade.
 */
export function openDatabase(
  file: string,
  migrations: readonly Migration[] = MIGRATIONS,
): DatabaseHandle {
  const db = new Database(file)
  // WAL é propriedade do arquivo, e um banco em memória não tem nenhum.
  if (file !== ':memory:') db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db, migrations)
  return db
}
