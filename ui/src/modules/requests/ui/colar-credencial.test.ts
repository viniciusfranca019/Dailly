// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { LockedSecretsError } from '@shared'
import type { HttpSpec } from '@dailly/requests-core/http'
import { testRequestsPort, testVaultPort } from '@shared/testing.js'
import { at, allAt, click, deps, fill, held, mount, novaRequest, request, requestRow, settle, text } from './test-harness.js'

/**
 * Passo 10: colar um curl com credencial (ADR 0013). A chave sai do curl para
 * o cofre, e a request fica com `{{nome}}` — nada é gravado em claro, nem por
 * um instante.
 */

const KEY = 'sk_live_123'
const CURL_KEY = `curl https://api.stripe.com/v1/charges -H 'Authorization: Bearer ${KEY}' -H 'Accept: application/json'`

const pasteInNew = async (vault: ReturnType<typeof testVaultPort>, port = testRequestsPort()) => {
  const { host } = mount(deps(port, vault))
  await settle()
  await novaRequest(host)
  await fill(at(host, 'url'), CURL_KEY)
  return { host, port }
}

const headerValues = (host: HTMLElement) =>
  allAt(host, 'header-value').map((input) => (input as HTMLInputElement).value)

describe('C1: colar abre o form das credenciais antes de salvar', () => {
  it('uma linha por credencial: o header, o valor mascarado e o nome sugerido editável', async () => {
    const { host } = await pasteInNew(testVaultPort({ state: 'aberto' }))

    expect(at(host, 'credentials-prompt')).not.toBeNull()
    expect(text(host, 'credential-label')).toBe('Authorization')
    expect(text(host, 'credential-value')).toBe('••••••••')
    expect(at<HTMLInputElement>(host, 'credential-name')?.value).toBe('api_stripe_com_authorization')
    expect(at(host, 'credential-name')?.getAttribute('aria-label')).toBeTruthy()
    expect(host.innerHTML).not.toContain(KEY)
  })
})

describe('C2: com o cofre trancado, o form pede a senha', () => {
  it('a senha errada é dita e nada é gravado; a certa segue', async () => {
    const vault = testVaultPort({ state: 'trancado', password: 'uma senha longa' })
    const { host } = await pasteInNew(vault)

    await fill(at(host, 'credentials-password'), 'errada demais')
    await click(at(host, 'credentials-confirm'))
    expect(text(host, 'credentials-error')).toMatch(/não abre/)
    expect(vault.saved.size).toBe(0)
    expect(at(host, 'credentials-prompt')).not.toBeNull()

    await fill(at(host, 'credentials-password'), 'uma senha longa')
    await click(at(host, 'credentials-confirm'))
    expect(vault.saved.get('api_stripe_com_authorization')).toBe(KEY)
    expect(at(host, 'credentials-prompt')).toBeNull()
  })

  it('a chave de recuperação também abre', async () => {
    const vault = testVaultPort({ state: 'trancado', recoveryKey: 'ABCD-EFGH' })
    const { host } = await pasteInNew(vault)

    await click(at(host, 'credentials-use-recovery'))
    await fill(at(host, 'credentials-recovery'), 'ABCD-EFGH')
    await click(at(host, 'credentials-confirm'))

    expect(vault.saved.get('api_stripe_com_authorization')).toBe(KEY)
  })
})

describe('C3: confirmar manda o valor ao cofre e deixa {{nome}} na request', () => {
  it('com o nome escolhido, mantendo o esquema; o salvo não tem o valor', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const { host, port } = await pasteInNew(vault)

    await fill(at(host, 'credential-name'), 'stripe_key')
    await click(at(host, 'credentials-confirm'))

    expect(vault.saved.get('stripe_key')).toBe(KEY)
    expect(headerValues(host)).toEqual(['Bearer {{stripe_key}}', 'application/json'])
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/charges')

    await click(at(host, 'save'))
    const [saved] = await port.requests()
    expect(JSON.stringify(saved)).not.toContain(KEY)
    expect(JSON.stringify(saved)).toContain('{{stripe_key}}')
  })
})

describe('C4: cancelar não salva nada', () => {
  it('nem a request, nem o segredo; o editor volta ao que era', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const { host, port } = await pasteInNew(vault)

    await click(at(host, 'credentials-cancel'))

    expect(at(host, 'credentials-prompt')).toBeNull()
    expect(vault.saved.size).toBe(0)
    expect(await port.requests()).toEqual([])
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('')
    expect(headerValues(host)).toEqual([])
    expect(host.innerHTML).not.toContain(KEY)
  })
})

describe('C5: um nome que já existe no cofre', () => {
  it('com outro valor, o form recusa e pede outro nome; nada é gravado', async () => {
    const vault = testVaultPort({ state: 'aberto', secrets: { stripe_key: 'outro' } })
    const { host } = await pasteInNew(vault)

    await fill(at(host, 'credential-name'), 'stripe_key')
    await click(at(host, 'credentials-confirm'))

    expect(text(host, 'credentials-error')).toMatch(/stripe_key/)
    expect(vault.saved.get('stripe_key')).toBe('outro')
    expect(at(host, 'credentials-prompt')).not.toBeNull()
  })

  it('com o mesmo valor, reaproveita o nome', async () => {
    const vault = testVaultPort({ state: 'aberto', secrets: { stripe_key: KEY } })
    const { host } = await pasteInNew(vault)

    await fill(at(host, 'credential-name'), 'stripe_key')
    await click(at(host, 'credentials-confirm'))

    expect(at(host, 'credentials-prompt')).toBeNull()
    expect(headerValues(host)).toContain('Bearer {{stripe_key}}')
  })
})

describe('C6: um curl sem credencial importa como sempre', () => {
  it('não abre form nenhum', async () => {
    const { host } = mount(deps(testRequestsPort(), testVaultPort({ state: 'trancado' })))
    await settle()
    await novaRequest(host)
    await fill(at(host, 'url'), `curl https://x.dev -H 'Accept: a/b'`)

    expect(at(host, 'credentials-prompt')).toBeNull()
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://x.dev')
  })
})

describe('C7: sem DAILLY_SECRET_KEY', () => {
  it.each(['sem-chave', 'so-recuperacao'] as const)('%s: diz o que falta e só oferece cancelar', async (state) => {
    const { host } = await pasteInNew(testVaultPort({ state }))

    expect(text(host, 'credentials-prompt')).toMatch(/DAILLY_SECRET_KEY/)
    expect(at(host, 'credentials-confirm')).toBeNull()
    expect(at(host, 'credentials-cancel')).not.toBeNull()
  })
})

describe('trocar de request com o form aberto', () => {
  it('fecha o form, e o curl não entra na outra request', async () => {
    const port = testRequestsPort({ requests: [request('r1', 'outra')] })
    const { host } = await pasteInNew(testVaultPort({ state: 'aberto' }), port)

    await click(requestRow(host, 'r1'))

    expect(at(host, 'credentials-prompt')).toBeNull()
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://x.dev/a')
  })
})

describe('gate 1 do passo 10', () => {
  it('(blocker) com o pedido de senha da execução na tela, colar um curl com chave tira o pedido, e nada é salvo', async () => {
    const vault = testVaultPort({ state: 'trancado', password: 'uma senha longa' })
    const saved = request('r1', 'usa token')
    const port = testRequestsPort({
      requests: [{ ...saved, spec: { ...(saved.spec as HttpSpec), headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }] } }],
      execute: async () => {
        throw new LockedSecretsError(['token'], 'o cofre está trancado')
      },
    })
    const save = vi.spyOn(port, 'saveRequest')
    const { host } = mount(deps(port, vault))
    await settle()
    await click(requestRow(host, 'r1'))
    await click(at(host, 'execute'))
    expect(at(host, 'vault-locked')).not.toBeNull()
    save.mockClear()

    await fill(at(host, 'url'), CURL_KEY)

    expect(at(host, 'credentials-prompt')).not.toBeNull()
    expect(at(host, 'vault-locked')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('gate 2 do passo 10 (major)', () => {
  it('cancelar fica desabilitado enquanto a gravação no cofre está em voo', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const gate = held()
    const slow = {
      ...vault,
      save: async (environment: string, name: string, value: string) => {
        await gate.promise
        await vault.save(environment, name, value)
      },
    }
    const { host } = await pasteInNew(slow as typeof vault)

    await click(at(host, 'credentials-confirm'))
    expect(at<HTMLButtonElement>(host, 'credentials-cancel')?.disabled).toBe(true)

    gate.release()
    await settle()
    expect(at(host, 'credentials-prompt')).toBeNull()
  })
})
