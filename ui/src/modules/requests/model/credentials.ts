import type { VaultPort } from '@shared'

/**
 * Gravar no cofre as credenciais de um curl colado (passo 10, ADR 0013).
 *
 * Tudo é conferido **antes** de qualquer escrita: um nome recusado no meio
 * deixaria metade das chaves no cofre e a request sem nenhuma — a pessoa
 * cancelaria e o cofre ficaria com lixo que ela não pediu.
 */
export interface CredentialPick {
  readonly name: string
  readonly value: string
}

/** O mesmo padrão que o servidor aceita em `/secrets/:env/:name`. */
const NAME = /^[^{}\s/]{1,128}$/

export class CredentialNameError extends Error {
  override readonly name = 'CredentialNameError'
}

/**
 * Grava cada valor sob o nome escolhido.
 *
 * Um nome que já existe com o **mesmo** valor é reaproveitado — uma chave, um
 * cadastro. Com **outro** valor é recusado: sobrescrever trocaria a chave de
 * toda request que já usa o nome, sem a pessoa ver.
 */
export async function stashCredentials(
  vault: VaultPort,
  environment: string,
  picks: readonly CredentialPick[],
): Promise<void> {
  const chosen = new Map<string, string>()
  for (const { name, value } of picks) {
    if (!NAME.test(name)) {
      throw new CredentialNameError(`«${name}» não serve de nome: sem espaço, chaves ou barra, até 128 caracteres`)
    }
    if (chosen.has(name) && chosen.get(name) !== value) {
      throw new CredentialNameError(`«${name}» foi dado a dois valores diferentes: cada valor precisa do seu nome`)
    }
    chosen.set(name, value)
  }

  const existing = new Set(
    (await vault.list()).filter((secret) => secret.environment === environment).map((secret) => secret.name),
  )
  const toSave: CredentialPick[] = []
  const taken: string[] = []
  for (const [name, value] of chosen) {
    if (!existing.has(name)) toSave.push({ name, value })
    else if ((await vault.reveal(environment, name)) !== value) taken.push(name)
  }
  if (taken.length > 0) {
    throw new CredentialNameError(
      `${taken.map((name) => `«${name}»`).join(', ')} já ${taken.length === 1 ? 'existe' : 'existem'} no cofre com outro valor: escolha outro nome`,
    )
  }
  for (const { name, value } of toSave) await vault.save(environment, name, value)
}
