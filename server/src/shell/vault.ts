import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  scryptSync,
} from 'node:crypto'
import type { Database } from 'better-sqlite3'

/**
 * @file O cofre de segredos da [ADR 0013](../../../docs/adrs/0013-cofre-de-segredos.md).
 *
 * Três chaves, e cada operação toca só a que precisa:
 *
 * - a **DEK**, 32 bytes aleatórios, cifra cada valor (AES-256-GCM);
 * - a **chave da sessão** sai de `scrypt(senha) + DAILLY_SECRET_KEY` juntos e
 *   cifra uma cópia da DEK — nenhuma das duas peças sozinha a calcula;
 * - a **chave de recuperação** cifra outra cópia, sozinha, e só existe fora da
 *   máquina.
 *
 * A DEK vive só na memória deste objeto. Um reinício a perde, e é isso que
 * "trancado" quer dizer.
 */

export interface KdfParams {
  readonly N: number
  readonly r: number
  readonly p: number
}

/** O custo de produção: ~128 MB e uma fração de segundo por tentativa. */
export const DEFAULT_KDF: KdfParams = { N: 2 ** 17, r: 8, p: 1 }

export type VaultStatus =
  | {
      readonly state: 'sem-chave'
      readonly missing: 'DAILLY_SECRET_KEY'
      /**
       * Se o cofre já existe. Sem a chave, um cofre criado ainda abre pela
       * recuperação; um que não existe não tem recuperação nenhuma — e a tela
       * precisa saber qual dos dois, para não pedir uma chave impossível.
       */
      readonly created: boolean
    }
  | { readonly state: 'nao-criado' | 'trancado' | 'aberto' }

export interface SecretSummary {
  readonly environment: string
  readonly name: string
  readonly updatedAt: string
}

/**
 * O port da auditoria §2.2, nas palavras de quem o usa.
 *
 * Quem executa uma request só precisa de `has` (para saber se uma variável
 * que faltou mora aqui) e de `get`. O resto é gestão, e é a tela que chama.
 */
export interface SecretStore {
  list(): readonly SecretSummary[]
  has(environment: string, name: string): boolean
  get(environment: string, name: string): string
  set(environment: string, name: string, value: string): void
  delete(environment: string, name: string): void
}

export interface Vault extends SecretStore {
  status(): VaultStatus
  create(password: string): { readonly recoveryKey: string }
  unlock(password: string): void
  unlockWithRecovery(recoveryKey: string): void
  setPassword(password: string): void
  lock(): void
}

export class VaultExistsError extends Error {
  override readonly name = 'VaultExistsError'
  constructor() {
    super('o cofre já existe; para trocar a senha, abra-o e defina uma nova')
  }
}

export class VaultNotCreatedError extends Error {
  override readonly name = 'VaultNotCreatedError'
  constructor() {
    super('o cofre ainda não foi criado')
  }
}

export class VaultLockedError extends Error {
  override readonly name = 'VaultLockedError'
  constructor() {
    super('o cofre está trancado: abra-o com a senha')
  }
}

/**
 * A senha (ou a chave de recuperação) não abriu.
 *
 * Não há hash da senha guardado: quem diz "errada" é a tag GCM da DEK cifrada,
 * que não fecha. A mesma falha cobre um `.env` trocado, e a mensagem diz isso,
 * porque é a outra metade da chave.
 */
export class WrongPasswordError extends Error {
  override readonly name = 'WrongPasswordError'
  constructor(what = 'a senha') {
    super(`${what} não abre o cofre (confira também se o DAILLY_SECRET_KEY é o mesmo de quando ele foi criado)`)
  }
}

export class MissingSecretKeyError extends Error {
  override readonly name = 'MissingSecretKeyError'
  constructor(detail = 'não está definida') {
    super(
      `DAILLY_SECRET_KEY ${detail}. Gere com \`openssl rand -base64 32\` e ponha no .env ` +
        '(ADR 0013); sem ela o cofre só abre pela chave de recuperação.',
    )
  }
}

export class SecretNotFoundError extends Error {
  override readonly name = 'SecretNotFoundError'
  constructor(environment: string, name: string) {
    super(`não há segredo "${name}" no ambiente "${environment}"`)
  }
}

/** A tag GCM de um valor não fechou: a linha foi alterada ou trocada com outra. */
export class CorruptSecretError extends Error {
  override readonly name = 'CorruptSecretError'
  constructor(environment: string, name: string) {
    super(`o segredo "${name}" do ambiente "${environment}" não decifra: a linha foi alterada`)
  }
}

interface Sealed {
  readonly ciphertext: Buffer
  readonly nonce: Buffer
  readonly tag: Buffer
}

const seal = (key: Buffer, plaintext: Buffer, aad: string): Sealed => {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { ciphertext, nonce, tag: cipher.getAuthTag() }
}

/** `null` quando a tag não fecha — quem chama decide o nome do erro. */
const open = (key: Buffer, sealed: Sealed, aad: string): Buffer | null => {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce)
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(sealed.tag)
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()])
  } catch {
    return null
  }
}

const hkdf = (ikm: Buffer, salt: Buffer, info: string): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, 32))

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 32 bytes → 52 caracteres base32, em grupos de quatro: legível e ditável. */
const encodeRecovery = (bytes: Buffer): string => {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)!.join('-')
}

const decodeRecovery = (text: string): Buffer | null => {
  const clean = text.toUpperCase().replaceAll(/[\s-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return out.length === 32 ? Buffer.from(out) : null
}

const SLOT_SESSION = 'sessao'
const SLOT_RECOVERY = 'recuperacao'
const DEK_AAD = 'dailly/vault/dek/v1'
/**
 * JSON, e não `ambiente:nome`: com um separador cru, `(a, "b:c")` e `("a:b", c)`
 * davam o mesmo AAD, e um texto cifrado copiado entre as duas linhas decifrava
 * como o valor da outra.
 */
const secretAad = (environment: string, name: string) =>
  `dailly/secret/v1:${JSON.stringify([environment, name])}`

/** A chave do `.env`, já validada; `null` quando falta, e o motivo para a mensagem. */
const parsePepper = (secretKey: string | undefined): { pepper: Buffer } | { problem: string } => {
  if (!secretKey?.trim()) return { problem: 'não está definida' }
  const pepper = Buffer.from(secretKey.trim(), 'base64')
  if (pepper.length < 32) return { problem: 'tem menos de 32 bytes depois do base64' }
  return { pepper }
}

export function createVault(options: {
  readonly db: Database
  readonly secretKey: string | undefined
  readonly kdf?: KdfParams
}): Vault {
  const { db } = options
  const parsedPepper = parsePepper(options.secretKey)
  const kdfForNew = options.kdf ?? DEFAULT_KDF

  /** A DEK aberta. Só memória; `null` é trancado. */
  let dek: Buffer | null = null

  const header = () =>
    db.prepare('SELECT kdf, salt FROM vault WHERE id = 1').get() as
      | { kdf: string; salt: Buffer }
      | undefined

  const requirePepper = (): Buffer => {
    if ('problem' in parsedPepper) throw new MissingSecretKeyError(parsedPepper.problem)
    return parsedPepper.pepper
  }

  const sessionKey = (password: string, salt: Buffer, kdf: KdfParams): Buffer => {
    const pepper = requirePepper()
    const stretched = scryptSync(password.normalize('NFC'), salt, 32, {
      ...kdf,
      maxmem: 256 * kdf.N * kdf.r + 1024 * 1024,
    })
    return hkdf(stretched, pepper, 'dailly/vault/kek/v1')
  }

  const recoveryKeyOf = (bytes: Buffer, salt: Buffer) => hkdf(bytes, salt, 'dailly/vault/recovery/v1')

  const writeSlot = (kind: string, key: Buffer, value: Buffer) => {
    const sealed = seal(key, value, `${DEK_AAD}:${kind}`)
    db.prepare(
      `INSERT INTO vault_slots (kind, wrapped_dek, nonce, tag) VALUES (?, ?, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET wrapped_dek = excluded.wrapped_dek,
         nonce = excluded.nonce, tag = excluded.tag`,
    ).run(kind, sealed.ciphertext, sealed.nonce, sealed.tag)
  }

  const openSlot = (kind: string, key: Buffer): Buffer | null => {
    const row = db
      .prepare('SELECT wrapped_dek, nonce, tag FROM vault_slots WHERE kind = ?')
      .get(kind) as { wrapped_dek: Buffer; nonce: Buffer; tag: Buffer } | undefined
    if (!row) return null
    return open(key, { ciphertext: row.wrapped_dek, nonce: row.nonce, tag: row.tag }, `${DEK_AAD}:${kind}`)
  }

  const requireCreated = () => {
    const found = header()
    if (!found) throw new VaultNotCreatedError()
    return { kdf: JSON.parse(found.kdf) as KdfParams, salt: found.salt }
  }

  const requireOpen = (): Buffer => {
    if (!dek) throw new VaultLockedError()
    return dek
  }

  return {
    status() {
      if ('problem' in parsedPepper && !dek) {
        return { state: 'sem-chave', missing: 'DAILLY_SECRET_KEY', created: header() !== undefined }
      }
      if (!header()) return { state: 'nao-criado' }
      return { state: dek ? 'aberto' : 'trancado' }
    },

    create(password) {
      requirePepper()
      if (header()) throw new VaultExistsError()
      const salt = randomBytes(16)
      const fresh = randomBytes(32)
      const recovery = randomBytes(32)
      db.transaction(() => {
        db.prepare("INSERT INTO vault (id, kdf, salt, created_at) VALUES (1, ?, ?, datetime('now'))").run(
          JSON.stringify(kdfForNew),
          salt,
        )
        writeSlot(SLOT_SESSION, sessionKey(password, salt, kdfForNew), fresh)
        writeSlot(SLOT_RECOVERY, recoveryKeyOf(recovery, salt), fresh)
      })()
      dek = fresh
      return { recoveryKey: encodeRecovery(recovery) }
    },

    unlock(password) {
      requirePepper()
      const { kdf, salt } = requireCreated()
      const opened = openSlot(SLOT_SESSION, sessionKey(password, salt, kdf))
      if (!opened) throw new WrongPasswordError()
      dek = opened
    },

    unlockWithRecovery(recoveryKey) {
      const { salt } = requireCreated()
      const bytes = decodeRecovery(recoveryKey)
      const opened = bytes ? openSlot(SLOT_RECOVERY, recoveryKeyOf(bytes, salt)) : null
      if (!opened) throw new WrongPasswordError('a chave de recuperação')
      dek = opened
    },

    setPassword(password) {
      const open = requireOpen()
      const { kdf, salt } = requireCreated()
      writeSlot(SLOT_SESSION, sessionKey(password, salt, kdf), open)
    },

    lock() {
      dek?.fill(0)
      dek = null
    },

    list() {
      return (
        db
          .prepare('SELECT environment, name, updated_at FROM secrets ORDER BY environment, name')
          .all() as { environment: string; name: string; updated_at: string }[]
      ).map((row) => ({ environment: row.environment, name: row.name, updatedAt: row.updated_at }))
    },

    has(environment, name) {
      return (
        db.prepare('SELECT 1 FROM secrets WHERE environment = ? AND name = ?').get(environment, name) !==
        undefined
      )
    },

    get(environment, name) {
      const key = requireOpen()
      const row = db
        .prepare('SELECT ciphertext, nonce, tag FROM secrets WHERE environment = ? AND name = ?')
        .get(environment, name) as { ciphertext: Buffer; nonce: Buffer; tag: Buffer } | undefined
      if (!row) throw new SecretNotFoundError(environment, name)
      const value = open(key, row, secretAad(environment, name))
      if (!value) throw new CorruptSecretError(environment, name)
      return value.toString('utf8')
    },

    set(environment, name, value) {
      const key = requireOpen()
      const sealed = seal(key, Buffer.from(value, 'utf8'), secretAad(environment, name))
      db.prepare(
        `INSERT INTO secrets (environment, name, ciphertext, nonce, tag, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(environment, name) DO UPDATE SET ciphertext = excluded.ciphertext,
           nonce = excluded.nonce, tag = excluded.tag, updated_at = excluded.updated_at`,
      ).run(environment, name, sealed.ciphertext, sealed.nonce, sealed.tag)
    },

    delete(environment, name) {
      db.prepare('DELETE FROM secrets WHERE environment = ? AND name = ?').run(environment, name)
    },
  }
}
