// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { LockedSecretsError, type RequestsPort } from '@shared'
import { testRequestsPort, testVaultPort } from '@shared/testing.js'
import { at, allAt, click, deps, executed, fill, mount, request, requestRow, settle, text } from './test-harness.js'

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
    // Sem cofre criado não existe chave de recuperação: pedir uma seria
    // oferecer uma porta que não existe (gate 2 do PR B).
    expect(at(host, 'vault-unlock-recovery')).toBeNull()
    expect(text(host, 'vault-missing-key')).not.toMatch(/recuperação/)
  })
})

describe('gate 1 do PR B', () => {
  it('(blocker) todo campo do cofre tem nome acessível', async () => {
    for (const state of ['nao-criado', 'trancado', 'aberto'] as const) {
      const { host, destroy } = mount(deps(testRequestsPort(), testVaultPort({ state })))
      await settle()
      await openPanel(host)
      if (state === 'trancado') await click(at(host, 'vault-use-recovery'))
      const inputs = [...host.querySelectorAll<HTMLInputElement>('[data-testid="vault-panel"] input')]
      expect(inputs.length, state).toBeGreaterThan(0)
      for (const input of inputs) expect(input.getAttribute('aria-label'), `${state}: ${input.dataset['testid']}`).toBeTruthy()
      destroy()
    }
  })

  it('(major) trocar de request tira o pedido de senha, e abrir não executa a outra', async () => {
    const vault = testVaultPort({ state: 'trancado', password: 'uma senha longa' })
    const execute = vi.fn<RequestsPort['execute']>(async (id) => {
      if (id === 'r1' && (await vault.status()) !== 'aberto') throw new LockedSecretsError(['stripe_key'], 'trancado')
      return executed()
    })
    const { host } = mount(
      deps(testRequestsPort({ requests: [request('r1', 'stripe'), request('r2', 'outra')], execute }), vault),
    )
    await settle()
    await click(requestRow(host, 'r1'))
    await click(at(host, 'execute'))
    expect(at(host, 'vault-locked')).not.toBeNull()

    await click(requestRow(host, 'r2'))

    expect(at(host, 'vault-locked')).toBeNull()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('(major) sem DAILLY_SECRET_KEY e com o cofre criado, a chave de recuperação abre pela tela', async () => {
    const vault = testVaultPort({ state: 'so-recuperacao', recoveryKey: 'ABCD-EFGH' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)

    await fill(at(host, 'vault-unlock-recovery'), 'ABCD-EFGH')
    await click(at(host, 'vault-unlock'))

    expect(await vault.status()).toBe('aberto')
    expect(at(host, 'vault-unlock-password')).toBeNull()
  })

  it('(nit) sem área de transferência, copiar diz isso em português', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined, configurable: true })
    const { host } = mount(deps(testRequestsPort(), testVaultPort({ state: 'aberto', secrets: { k: 'v' } })))
    await settle()
    await openPanel(host)
    await click(at(host, 'secret-copy'))
    expect(text(host, 'vault-error')).toMatch(/área de transferência/)
  })
})

describe('gate 2 do PR B', () => {
  it('(nit) uma chave de recuperação errada é recusada e dita', async () => {
    const vault = testVaultPort({ state: 'trancado', recoveryKey: 'ABCD-EFGH' })
    const { host } = mount(deps(testRequestsPort(), vault))
    await settle()
    await openPanel(host)
    await click(at(host, 'vault-use-recovery'))
    await fill(at(host, 'vault-unlock-recovery'), 'ZZZZ-ZZZZ')
    await click(at(host, 'vault-unlock'))
    expect(text(host, 'vault-error')).toMatch(/não abre/)
    expect(await vault.status()).toBe('trancado')
  })
})
