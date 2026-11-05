import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES, StatusNotFoundError, TitleRequiredError } from '../task.js'
import type { TaskStore } from '../task-store.js'

/**
 * As promessas do `TaskStore`, provadas contra qualquer implementação.
 *
 * O mesmo padrão do `entryRepositoryContract` e do `requestStoreContract`: o
 * fake em memória e o SQLite passam pela mesma suíte, então a tela testada
 * contra um fake não está sendo testada contra uma promessa que o banco não
 * cumpre.
 */
export function taskStoreContract(label: string, { make }: { make: () => TaskStore }): void {
  describe(`${label} — contrato do TaskStore`, () => {
    it('nasce com os cinco status fixos, na ordem, e sem tarefa (RN2)', async () => {
      const board = await make().board()
      expect(board.statuses).toEqual(DEFAULT_STATUSES)
      expect(board.tasks).toEqual([])
    })

    it('cria com a chave seguinte, o título aparado e prioridade "sem"', async () => {
      const store = make()
      const first = await store.create({ title: '  Comprar café ', statusId: 'todo' })
      const second = await store.create({ title: 'Ligar pro banco', statusId: 'doing' })

      expect(first).toMatchObject({
        key: 1,
        title: 'Comprar café',
        statusId: 'todo',
        priority: 0,
        completedAt: null,
      })
      expect(second.key).toBe(2)
      expect(first.id).not.toBe(second.id)
    })

    it('põe a tarefa nova no topo do status dela', async () => {
      const store = make()
      await store.create({ title: 'primeira', statusId: 'todo' })
      await store.create({ title: 'segunda', statusId: 'todo' })

      const { tasks } = await store.board()
      expect(tasks.map((task) => task.title)).toEqual(['segunda', 'primeira'])
    })

    it('ordena pelo status, na ordem dos status, e depois pelo rank', async () => {
      const store = make()
      await store.create({ title: 'feito', statusId: 'done' })
      await store.create({ title: 'backlog', statusId: 'backlog' })
      await store.create({ title: 'a fazer', statusId: 'todo' })

      const { tasks } = await store.board()
      expect(tasks.map((task) => task.title)).toEqual(['backlog', 'a fazer', 'feito'])
    })

    it('não reaproveita a chave de uma tarefa apagada, nem a da maior (RN5)', async () => {
      const store = make()
      await store.create({ title: 'um', statusId: 'todo' })
      await store.create({ title: 'dois', statusId: 'todo' })

      expect(await store.delete(2)).toBe(true)
      const third = await store.create({ title: 'três', statusId: 'todo' })

      expect(third.key).toBe(3)
      expect((await store.board()).tasks.map((task) => task.key)).toEqual([3, 1])
    })

    it('diz que não apagou nada quando a chave não existe', async () => {
      expect(await make().delete(99)).toBe(false)
    })

    it('recusa título vazio e não grava nada (C5)', async () => {
      const store = make()
      await expect(store.create({ title: '   ', statusId: 'todo' })).rejects.toThrow(
        TitleRequiredError,
      )
      expect((await store.board()).tasks).toEqual([])
    })

    it('recusa um status que não existe e não gasta a chave', async () => {
      const store = make()
      await expect(store.create({ title: 'x', statusId: 'nope' })).rejects.toThrow(
        StatusNotFoundError,
      )
      expect((await store.create({ title: 'y', statusId: 'todo' })).key).toBe(1)
    })
  })
}
