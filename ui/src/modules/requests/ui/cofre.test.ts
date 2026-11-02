// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { LockedSecretsError, type RequestsPort } from '@shared'
import { testRequestsPort, testVaultPort } from '@shared/testing.js'
import { at, allAt, click, deps, executed, fill, mount, request, settle, text } from './test-harness.js'

/**
 * A tela do cofre (ADR 0013, PR B). O fake do cofre é escrito à mão: guarda a
 * senha, o estado e os valores em memória, como o servidor faria por trás.
 */

const openPanel = async (host: HTMLElement) => click(at(host, 'vault-toggle'))

describe('T1: destrancar na hora de executar', () => {
  const lockedThenOk = (vault: ReturnType<typeof testVaultPort>) => {
    const execute = vi.fn<RequestsPort['execute']>(async () => {
      if ((await vault.status()) !== 'aberto') {
        throw new LockedSecretsError(['stripe_key'], 'o cofre está trancado')
      }
      return executed()
    })
    return execute
  }

  it('o 423 pede a senha; a certa destranca e repete a execução', async () => {
    const vault = testVaultPort({ state: 'trancado', password: 'uma senha longa' })
    const execute = lockedThenOk(vault)
    const { host } = mount(deps(testRequestsPort({ requests: [request('r1', 'stripe')], execute }), vault))
    await settle()
    await click(allAt(host, 'request')[0]!)

    await click(at(host, 'execute'))
    expect(text(host, 'vault-locked')).toContain('stripe_key')
    expect(at(host, 'response')).toBeNull()

    await fill(at(host, 'vault-unlock-password'), 'uma senha longa')
    await click(at(host, 'vault-unlock'))

    expect(execute).toHaveBeenCalledTimes(2)
    expect(at(host, 'response')).not.toBeNull()
    expect(at(host, 'vault-locked')).toBeNull()
  })

  it('a senha errada é dita, e nada executa de novo', async () => {
    const vault = testVaultPort({ state: 'trancado', password: 'uma senha longa' })
    const execute = lockedThenOk(vault)
    const { host } = mount(deps(testRequestsPort({ requests: [request('r1', 'stripe')], execute }), vault))
    await settle()
    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    await fill(at(host, 'vault-unlock-password'), 'errada demais')
    await click(at(host, 'vault-unlock'))

    expect(text(host, 'vault-error')).toMatch(/não abre/)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})

describe('T2: segredos mascarados, revelar, esconder e copiar', () => {
  it('mostra o nome e ••••; revelar busca o valor; esconder mascara de novo; copiar copia', async () => {
    const vault = testVaultPort({ state: 'aberto', secrets: { stripe_key: 'sk_live_123' } })
    const writeText = vi.fn(async () => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)

    expect(text(host, 'secret-name')).toBe('stripe_key')
    expect(text(host, 'secret-value')).toBe('••••••••')
    expect(host.innerHTML).not.toContain('sk_live_123')

    await click(at(host, 'secret-reveal'))
    expect(text(host, 'secret-value')).toBe('sk_live_123')

    await click(at(host, 'secret-reveal'))
    expect(text(host, 'secret-value')).toBe('••••••••')
    expect(host.innerHTML).not.toContain('sk_live_123')

    await click(at(host, 'secret-copy'))
    expect(writeText).toHaveBeenCalledWith('sk_live_123')
    expect(host.innerHTML).not.toContain('sk_live_123')
  })
})

describe('T3: criar o cofre', () => {
  it('pede senha de 8+, mostra a chave de recuperação uma vez, e ela some no "guardei"', async () => {
    const vault = testVaultPort({ state: 'nao-criado' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)

    await fill(at(host, 'vault-create-password'), 'curta')
    await click(at(host, 'vault-create'))
    expect(text(host, 'vault-error')).toMatch(/8/)

    await fill(at(host, 'vault-create-password'), 'uma senha longa')
    await click(at(host, 'vault-create'))
    expect(text(host, 'vault-recovery')).toMatch(/[A-Z2-7]{4}-/)

    await click(at(host, 'vault-recovery-done'))
    expect(at(host, 'vault-recovery')).toBeNull()
    expect(at(host, 'secret-add')).not.toBeNull()
  })
})

describe('T4: gravar e apagar', () => {
  it('grava um segredo novo e apaga', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)

    await fill(at(host, 'secret-new-name'), 'stripe_key')
    await fill(at(host, 'secret-new-value'), 'sk_live_123')
    await click(at(host, 'secret-add'))

    expect(text(host, 'secret-name')).toBe('stripe_key')
    expect((at<HTMLInputElement>(host, 'secret-new-value')!).value).toBe('')

    await click(at(host, 'secret-delete'))
    expect(at(host, 'secret-name')).toBeNull()
    expect(await vault.list()).toEqual([])
  })

  it('trancar fecha o painel para a senha', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)
    await click(at(host, 'vault-lock'))
    expect(at(host, 'vault-unlock-password')).not.toBeNull()
  })
})

describe('T5: sem DAILLY_SECRET_KEY', () => {
  it('diz o que falta e como gerar, sem formulário de senha', async () => {
    const vault = testVaultPort({ state: 'sem-chave' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)
    expect(text(host, 'vault-missing-key')).toMatch(/DAILLY_SECRET_KEY.*openssl rand -base64 32/s)
    expect(at(host, 'vault-unlock-password')).toBeNull()
    expect(at(host, 'vault-create-password')).toBeNull()
  })
})
