import { describe, expect, it } from 'vitest'
import { FolderCycleError } from '../storage/folder.js'
import { FolderNotFoundError, type RequestStore } from '../storage/request-store.js'

/**
 * O protocolo da fixture é inventado, e isso é o teste e não um detalhe.
 *
 * O `RequestStore` guarda um envelope e um `spec` opaco; ele não conhece
 * protocolo nenhum. Escrever `http` aqui provaria que ele guarda HTTP, que é a
 * coisa errada — e o `architecture.test.ts` derruba, porque um arquivo do
 * modelo que escreve o nome de um protocolo é exatamente o que a regra do C5
 * proíbe. Foi ele quem apontou.
 */
const aSpec = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'req-1',
  name: 'listar cobranças',
  protocol: 'protocolo-de-teste',
  spec: {
    alvo: 'exemplo/charges',
    cabecalhos: [{ nome: 'Accept', valor: 'application/json' }],
    corpo: null,
    credencial: { usuario: '{{chave}}', senha: '' },
  },
  folderId: null,
  position: 0,
  ...over,
})

/**
 * As promessas da port, provadas contra qualquer implementação.
 *
 * O mesmo padrão do `entryRepositoryContract` do `@dailly/domain`, e pela
 * mesma razão: duas implementações, um conjunto de promessas, provado em vez
 * de suposto. O fake em memória e o SQLite passam por aqui.
 */
export function requestStoreContract(
  label: string,
  { make }: { make: () => RequestStore },
): void {
  describe(`${label} — contrato do RequestStore`, () => {
    it('C1: devolve a request exatamente como ela foi salva', async () => {
      const store = make()
      const request = aSpec()

      await store.saveRequest(request)

      expect(await store.requestById('req-1')).toEqual(request)
    })

    it('C1: guarda o spec inteiro, incluindo o que é do protocolo', async () => {
      // O `spec` é JSON opaco para o banco. Se o round-trip perder um campo,
      // perde em silêncio — e o defeito só aparece na hora de executar.
      const store = make()
      await store.saveRequest(aSpec())

      const [found] = await store.requests()

      expect(found?.spec).toEqual(aSpec().spec)
    })

    it('C1: guarda a request dentro da pasta onde ela foi posta', async () => {
      const store = make()
      await store.saveFolder({ id: 'f1', parentId: null, name: 'APIs', position: 0 })

      await store.saveRequest(aSpec({ folderId: 'f1' }))

      expect((await store.requestById('req-1'))?.folderId).toBe('f1')
    })

    it('C1: recusa salvar numa pasta que não existe, em vez de deixar órfã', async () => {
      const store = make()

      await expect(store.saveRequest(aSpec({ folderId: 'fantasma' }))).rejects.toThrow(
        FolderNotFoundError,
      )
    })

    it('C1: salvar duas vezes com o mesmo id substitui, não duplica', async () => {
      const store = make()
      await store.saveRequest(aSpec())
      await store.saveRequest(aSpec({ name: 'outro nome' }))

      const all = await store.requests()

      expect(all).toHaveLength(1)
      expect(all[0]?.name).toBe('outro nome')
    })

    it('C1: lista na ordem que o usuário escolheu, não na alfabética', async () => {
      const store = make()
      await store.saveRequest(aSpec({ id: 'b', name: 'A vem depois', position: 1 }))
      await store.saveRequest(aSpec({ id: 'a', name: 'Z vem antes', position: 0 }))

      expect((await store.requests()).map((request) => request.id)).toEqual(['a', 'b'])
    })

    it('C1: apagar tira da listagem', async () => {
      const store = make()
      await store.saveRequest(aSpec())
      await store.deleteRequest('req-1')

      expect(await store.requests()).toEqual([])
      expect(await store.requestById('req-1')).toBeUndefined()
    })

    it('C6: recusa mover uma pasta para dentro da própria descendência', async () => {
      const store = make()
      await store.saveFolder({ id: 'raiz', parentId: null, name: 'APIs', position: 0 })
      await store.saveFolder({ id: 'filha', parentId: 'raiz', name: 'Auth', position: 0 })

      await expect(store.moveFolder('raiz', 'filha')).rejects.toThrow(FolderCycleError)

      expect((await store.folders()).find((f) => f.id === 'raiz')?.parentId).toBeNull()
    })

    it('C6: recusa o laço também quando ele chega por salvar, não por mover', async () => {
      // A segunda porta da regra, que ficou aberta até o gate encontrá-la:
      // salvar é upsert, então ele reparenta — e o contrato só exercitava o
      // verbo "mover". C6 é propriedade da árvore, não do verbo.
      const store = make()
      await store.saveFolder({ id: 'raiz', parentId: null, name: 'APIs', position: 0 })
      await store.saveFolder({ id: 'filha', parentId: 'raiz', name: 'Auth', position: 0 })

      await expect(
        store.saveFolder({ id: 'raiz', parentId: 'filha', name: 'APIs', position: 0 }),
      ).rejects.toThrow(FolderCycleError)

      expect((await store.folders()).find((f) => f.id === 'raiz')?.parentId).toBeNull()
    })

    it('C6: recusa também a pasta salva como filha dela mesma', async () => {
      const store = make()
      await store.saveFolder({ id: 'a', parentId: null, name: 'A', position: 0 })

      await expect(
        store.saveFolder({ id: 'a', parentId: 'a', name: 'A', position: 0 }),
      ).rejects.toThrow(FolderCycleError)
    })

    it('C6: mover uma pasta que não existe é recusado, não respondido como sucesso', async () => {
      const store = make()
      await store.saveFolder({ id: 'raiz', parentId: null, name: 'APIs', position: 0 })

      await expect(store.moveFolder('fantasma', 'raiz')).rejects.toThrow(FolderNotFoundError)
    })

    it('C6: aceita o movimento que não fecha laço', async () => {
      const store = make()
      await store.saveFolder({ id: 'raiz', parentId: null, name: 'APIs', position: 0 })
      await store.saveFolder({ id: 'outra', parentId: null, name: 'Interno', position: 1 })

      await store.moveFolder('outra', 'raiz')

      expect((await store.folders()).find((f) => f.id === 'outra')?.parentId).toBe('raiz')
    })
  })
}
