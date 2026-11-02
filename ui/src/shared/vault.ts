/**
 * A port do cofre (ADR 0013), nas palavras da tela.
 *
 * A tela nunca guarda um valor: ela pede para revelar quando a pessoa clica, e
 * o valor vive só enquanto está à mostra. Quem cifra, decifra e guarda a chave
 * é o servidor.
 */
export type VaultState = 'sem-chave' | 'nao-criado' | 'trancado' | 'aberto'

export interface SecretSummary {
  readonly environment: string
  readonly name: string
}

export interface VaultPort {
  status(): Promise<VaultState>
  /** Devolve a chave de recuperação — a única vez que ela existe fora do servidor. */
  create(password: string): Promise<string>
  unlock(password: string): Promise<void>
  unlockWithRecovery(recoveryKey: string): Promise<void>
  lock(): Promise<void>
  list(): Promise<readonly SecretSummary[]>
  reveal(environment: string, name: string): Promise<string>
  save(environment: string, name: string, value: string): Promise<void>
  remove(environment: string, name: string): Promise<void>
}

/**
 * O cofre recusou, e o porquê é um dos que a tela sabe dizer.
 *
 * `kind` é o que muda o que a tela mostra (pedir a senha, dizer que falta o
 * `.env`); a mensagem é a do servidor, que diz o resto.
 */
export type VaultRefusal = 'locked' | 'wrong-password' | 'missing-key' | 'exists' | 'invalid'

export class VaultRefusedError extends Error {
  override readonly name = 'VaultRefusedError'
  constructor(
    readonly kind: VaultRefusal,
    message: string,
  ) {
    super(message)
  }
}

/**
 * A execução precisou de variáveis que só o cofre tem, e ele não está aberto.
 *
 * Os nomes vêm junto porque a tela os mostra ao pedir a senha: "cofre
 * trancado" sem dizer para quê manda a pessoa adivinhar.
 */
export class LockedSecretsError extends Error {
  override readonly name = 'LockedSecretsError'
  constructor(
    readonly names: readonly string[],
    message: string,
  ) {
    super(message)
  }
}
