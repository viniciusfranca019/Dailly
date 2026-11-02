import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../shell/database.js'
import {
  CorruptSecretError,
  MissingSecretKeyError,
  VaultExistsError,
  VaultLockedError,
  WrongPasswordError,
  createVault,
} from './vault.js'

/**
 * O núcleo do cofre (ADR 0013), contra um SQLite real em memória.
 *
 * O `scrypt` roda com custo baixo aqui (`FAST`): o que se testa é o desenho das
 * chaves, não a lentidão que protege a senha. O custo de produção é conferido à
 * parte, no que fica gravado.
 */
const FAST = { N: 2 ** 10, r: 8, p: 1 }
const pepper = () => randomBytes(32).toString('base64')

/** `null` é "sem .env": um `undefined` aqui cairia no padrão e geraria uma chave. */
const fresh = (key: string | null = pepper()) => {
  const secretKey = key ?? undefined
  const db = openDatabase(':memory:')
  return { db, secretKey, vault: createVault({ db, secretKey, kdf: FAST }) }
}

/** O mesmo banco e o mesmo `.env`, depois de um reinício: a DEK sumiu da memória. */
const restart = (state: { db: ReturnType<typeof openDatabase>; secretKey: string | undefined }) =>
  createVault({ db: state.db, secretKey: state.secretKey, kdf: FAST })

describe('C1: criar o cofre', () => {
  it('devolve a chave de recuperação uma vez e deixa o cofre aberto', () => {
    const { vault } = fresh()
    expect(vault.status()).toEqual({ state: 'nao-criado' })

    const { recoveryKey } = vault.create('uma senha longa')

    expect(recoveryKey).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/)
    expect(vault.status()).toEqual({ state: 'aberto' })
  })

  it('recusa criar de novo', () => {
    const { vault } = fresh()
    vault.create('uma senha longa')
    expect(() => vault.create('outra senha longa')).toThrow(VaultExistsError)
  })

  it('grava o custo do scrypt junto com o cofre, para ele poder subir depois', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    const row = state.db.prepare('SELECT kdf FROM vault WHERE id = 1').get() as { kdf: string }
    expect(JSON.parse(row.kdf)).toEqual(FAST)
  })
})

describe('C2: trancar e destrancar', () => {
  it('um reinício tranca; a senha errada é recusada e a certa abre', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    state.vault.set('default', 'stripe_key', 'sk_live_123')

    const again = restart(state)
    expect(again.status()).toEqual({ state: 'trancado' })
    expect(() => again.get('default', 'stripe_key')).toThrow(VaultLockedError)

    expect(() => again.unlock('senha errada')).toThrow(WrongPasswordError)
    expect(again.status()).toEqual({ state: 'trancado' })

    again.unlock('uma senha longa')
    expect(again.get('default', 'stripe_key')).toBe('sk_live_123')
  })

  it('lock tranca na hora', () => {
    const { vault } = fresh()
    vault.create('uma senha longa')
    vault.lock()
    expect(vault.status()).toEqual({ state: 'trancado' })
  })

  it('a senha sozinha não abre com outro .env', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    const otherEnv = createVault({ db: state.db, secretKey: pepper(), kdf: FAST })
    expect(() => otherEnv.unlock('uma senha longa')).toThrow(WrongPasswordError)
  })
})

describe('C3: sem DAILLY_SECRET_KEY', () => {
  it('o status diz o que falta, e criar e destrancar recusam com esse motivo', () => {
    const { vault } = fresh(null)
    expect(vault.status()).toEqual({ state: 'sem-chave', missing: 'DAILLY_SECRET_KEY' })
    expect(() => vault.create('uma senha longa')).toThrow(MissingSecretKeyError)
    expect(() => vault.unlock('uma senha longa')).toThrow(MissingSecretKeyError)
  })

  it('uma chave curta demais conta como ausente, dizendo por quê', () => {
    const { vault } = fresh(randomBytes(8).toString('base64'))
    expect(() => vault.create('uma senha longa')).toThrow(/32 bytes/)
  })
})

describe('C6: recuperação', () => {
  it('abre sozinha, sem senha e sem .env', () => {
    const state = fresh()
    const { recoveryKey } = state.vault.create('uma senha longa')
    state.vault.set('default', 'stripe_key', 'sk_live_123')

    const semEnv = createVault({ db: state.db, secretKey: undefined, kdf: FAST })
    semEnv.unlockWithRecovery(recoveryKey)

    expect(semEnv.get('default', 'stripe_key')).toBe('sk_live_123')
  })

  it('depois dela, uma senha nova substitui a antiga', () => {
    const state = fresh()
    const { recoveryKey } = state.vault.create('uma senha longa')

    const again = restart(state)
    again.unlockWithRecovery(recoveryKey.toLowerCase())
    again.setPassword('a senha nova e longa')

    const later = restart(state)
    expect(() => later.unlock('uma senha longa')).toThrow(WrongPasswordError)
    later.unlock('a senha nova e longa')
    expect(later.status()).toEqual({ state: 'aberto' })
  })

  it('uma chave de recuperação errada é recusada', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    const other = fresh().vault.create('x senha longa').recoveryKey
    expect(() => restart(state).unlockWithRecovery(other)).toThrow(WrongPasswordError)
  })
})

describe('C7: uma linha trocada não decifra', () => {
  it('copiar o texto cifrado de um segredo para outro falha com erro nomeado', () => {
    const { db, vault } = fresh()
    vault.create('uma senha longa')
    vault.set('default', 'a', 'valor de a')
    vault.set('default', 'b', 'valor de b')

    db.prepare(
      `UPDATE secrets SET (ciphertext, nonce, tag) =
         (SELECT ciphertext, nonce, tag FROM secrets WHERE name = 'a')
       WHERE name = 'b'`,
    ).run()

    expect(() => vault.get('default', 'b')).toThrow(CorruptSecretError)
    expect(vault.get('default', 'a')).toBe('valor de a')
  })
})

describe('a listagem e o apagar não precisam do cofre aberto', () => {
  it('lista nomes, nunca valores, e apaga', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    state.vault.set('default', 'stripe_key', 'sk_live_123')

    const locked = restart(state)
    expect(locked.list()).toEqual([
      { environment: 'default', name: 'stripe_key', updatedAt: expect.any(String) },
    ])
    expect(JSON.stringify(locked.list())).not.toContain('sk_live_123')
    expect(locked.has('default', 'stripe_key')).toBe(true)

    locked.delete('default', 'stripe_key')
    expect(locked.list()).toEqual([])
  })

  it('gravar exige o cofre aberto', () => {
    const state = fresh()
    state.vault.create('uma senha longa')
    expect(() => restart(state).set('default', 'x', 'y')).toThrow(VaultLockedError)
  })
})
