import { describe, expect, it } from 'vitest'
import { testVaultPort } from '@shared/testing.js'
import { stashCredentials } from './credentials.js'

describe('gate 2 do passo 10 (major): gravar é tudo ou nada', () => {
  it('se o segundo save falha, o primeiro sai do cofre e o erro sobe', async () => {
    const vault = testVaultPort({ state: 'aberto' })
    const failing = {
      ...vault,
      save: async (environment: string, name: string, value: string) => {
        if (name === 'b') throw new Error('o servidor recusou')
        await vault.save(environment, name, value)
      },
    }

    await expect(
      stashCredentials(failing, 'default', [
        { name: 'a', value: '1' },
        { name: 'b', value: '2' },
      ]),
    ).rejects.toThrow(/recusou/)
    expect(vault.saved.size).toBe(0)
  })
})
