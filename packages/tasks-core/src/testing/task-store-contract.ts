import { describe, expect, it } from 'vitest'
import { CommentRequiredError } from '../comment.js'
import {
  BoardNotFoundError,
  InvalidPrefixError,
  NameRequiredError,
  PrefixTakenError,
  SEED_BOARD,
} from '../board.js'
import {
  DEFAULT_STATUSES,
  InvalidPriorityError,
  InvalidRankError,
  StatusNotFoundError,
  TitleRequiredError,
} from '../task.js'
import type { TaskStore } from '../task-store.js'

/**
 * As promessas do `TaskStore`, provadas contra qualquer implementação.
 *
 * O mesmo padrão do `entryRepositoryContract` e do `requestStoreContract`: o
 * fake em memória e o SQLite passam pela mesma suíte, então a tela testada
 * contra um fake não está sendo testada contra uma promessa que o banco não
 * cumpre.
 */
const T = (key: number) => ({ prefix: 'T', key })
const IN = SEED_BOARD.id
/** The seed board's read; every store has it. */
const seedBoard = async (store: TaskStore) => {
  const read = await store.board(IN)
  if (!read) throw new Error('the seed board is missing')
  return read
}

export function taskStoreContract(label: string, { make }: { make: () => TaskStore }): void {
  describe(`${label} — contrato do TaskStore`, () => {
    it('#45 C1: comenta a tarefa, e lê os comentários do mais antigo ao mais novo', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      const first = await store.addComment(T(1), '  liguei pro encanador \n')
      const second = await store.addComment(T(1), 'ele vem **quinta**')

      expect(first).toMatchObject({ body: 'liguei pro encanador', createdAt: expect.any(String) })
      expect(second?.id).not.toBe(first?.id)
      expect((await store.comments(T(1)))?.map((comment) => comment.body)).toEqual([
        'liguei pro encanador',
        'ele vem **quinta**',
      ])
    })

    it('#45 C3: recusa o comentário vazio e não grava nada', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      for (const body of ['', '   ', '\n \n']) {
        await expect(store.addComment(T(1), body)).rejects.toThrow(CommentRequiredError)
      }
      expect(await store.comments(T(1))).toEqual([])
    })

    it('#45 C5: apaga o comentário, e ele não volta', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      const kept = await store.addComment(T(1), 'liguei pro encanador')
      const gone = await store.addComment(T(1), 'ele vem quinta')

      expect(await store.deleteComment(T(1), gone!.id)).toBe('deleted')
      expect(await store.comments(T(1))).toEqual([kept])
      expect(await store.deleteComment(T(1), gone!.id)).toBe('comment-not-found')
    })

    it('#45: a tarefa que não existe não tem comentário, e o de outra tarefa não é achado', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.create({ boardId: IN, title: 'dois', statusId: 'todo' })
      const other = await store.addComment(T(2), 'da dois')

      expect(await store.comments(T(9))).toBeNull()
      expect(await store.addComment(T(9), 'x')).toBeNull()
      // The task is looked up first: a body for a task that is gone is moot.
      expect(await store.addComment(T(9), '   ')).toBeNull()
      expect(await store.deleteComment(T(9), other!.id)).toBe('task-not-found')
      expect(await store.deleteComment(T(1), other!.id)).toBe('comment-not-found')
      expect(await store.comments(T(2))).toEqual([other])
    })

    it('#45: os comentários vão junto com a tarefa apagada', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.addComment(T(1), 'x')

      await store.delete(T(1))

      expect(await store.comments(T(1))).toBeNull()
    })

    it('nasce com o board "Tasks", de prefixo T (RN10)', async () => {
      expect(await make().boards()).toEqual([SEED_BOARD])
    })

    it('C1: cria um board, que aparece depois do "Tasks" e abre vazio, com os cinco status', async () => {
      const store = make()
      const casa = await store.createBoard({ name: '  Casa ', prefix: 'CASA' })

      expect(casa).toMatchObject({ name: 'Casa', prefix: 'CASA' })
      expect(casa.id).not.toBe(IN)
      expect(await store.boards()).toEqual([SEED_BOARD, casa])
      expect(await store.board(casa.id)).toEqual({ statuses: DEFAULT_STATUSES, tasks: [] })
    })

    it('C2: recusa o prefixo vazio, fora de A–Z e 0–9, longo ou já usado, e não grava nada (RN9)', async () => {
      const store = make()
      for (const prefix of ['', 'CA-SA', 'CASINHA']) {
        await expect(store.createBoard({ name: 'Casa', prefix })).rejects.toThrow(InvalidPrefixError)
      }
      await expect(store.createBoard({ name: 'Casa', prefix: 'T' })).rejects.toThrow(
        new PrefixTakenError('T').message,
      )
      expect(await store.boards()).toEqual([SEED_BOARD])
    })

    it('C3: recusa o nome vazio e não grava nada', async () => {
      const store = make()
      await expect(store.createBoard({ name: ' ', prefix: 'CASA' })).rejects.toThrow(NameRequiredError)
      expect(await store.boards()).toEqual([SEED_BOARD])
    })

    it('C4: cada board lê só as tarefas dele', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.create({ boardId: IN, title: 'Pagar o condomínio', statusId: 'todo' })
      await store.create({ boardId: casa.id, title: 'Trocar a lâmpada', statusId: 'todo' })

      expect((await store.board(casa.id))?.tasks.map((task) => [task.keyPrefix, task.key, task.title])).toEqual([
        ['CASA', 1, 'Trocar a lâmpada'],
      ])
      expect((await seedBoard(store)).tasks.map((task) => task.title)).toEqual(['Pagar o condomínio'])
    })

    it('lê null para um board que não existe, e recusa criar tarefa nele', async () => {
      const store = make()
      expect(await store.board('nope')).toBeNull()
      await expect(store.create({ boardId: 'nope', title: 'x', statusId: 'todo' })).rejects.toThrow(
        BoardNotFoundError,
      )
    })

    it('C6: a chave é sequencial dentro do board, independente dos outros (RN5)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      for (let n = 0; n < 7; n += 1) await store.create({ boardId: IN, title: `t${n}`, statusId: 'todo' })
      await store.create({ boardId: casa.id, title: 'um', statusId: 'todo' })
      await store.create({ boardId: casa.id, title: 'dois', statusId: 'todo' })

      const third = await store.create({ boardId: casa.id, title: 'Comprar tinta', statusId: 'todo' })

      expect(third).toMatchObject({ keyPrefix: 'CASA', key: 3, boardId: casa.id })
      expect((await store.board(casa.id))?.tasks[0]?.title).toBe('Comprar tinta')
    })

    it('C7: trocar o prefixo vale só para as tarefas novas, e a chave antiga continua achando a tarefa', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      for (const title of ['um', 'dois', 'três']) await store.create({ boardId: casa.id, title, statusId: 'todo' })

      expect(await store.updateBoard(casa.id, { prefix: 'LAR' })).toEqual({ ...casa, prefix: 'LAR' })
      const fourth = await store.create({ boardId: casa.id, title: 'Pintar a sala', statusId: 'todo' })

      expect([fourth.keyPrefix, fourth.key]).toEqual(['LAR', 4])
      const keys = (await store.board(casa.id))?.tasks.map((task) => `${task.keyPrefix}-${task.key}`)
      expect(keys?.sort()).toEqual(['CASA-1', 'CASA-2', 'CASA-3', 'LAR-4'])
      expect(await store.update({ prefix: 'CASA', key: 2 }, { title: 'dois!' })).toMatchObject({ title: 'dois!' })
      expect(await store.update({ prefix: 'LAR', key: 2 }, { title: 'x' })).toBeNull()
    })

    it('C8: um prefixo trocado continua reservado para o board que o usou (RN9)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.updateBoard(casa.id, { prefix: 'LAR' })

      await expect(store.createBoard({ name: 'Casinha', prefix: 'CASA' })).rejects.toThrow(
        'o prefixo CASA já foi usado por um board',
      )
      expect(await store.boards()).toHaveLength(2)
      // The board that used it may take it back: its counter never goes back, so no key collides.
      expect(await store.updateBoard(casa.id, { prefix: 'CASA' })).toMatchObject({ prefix: 'CASA' })
    })

    it('updateBoard: troca o nome, recusa prefixo inválido ou de outro board, e devolve null para o id que não existe', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })

      expect(await store.updateBoard(casa.id, { name: ' Lar ' })).toEqual({ ...casa, name: 'Lar' })
      await expect(store.updateBoard(casa.id, { name: '' })).rejects.toThrow(NameRequiredError)
      await expect(store.updateBoard(casa.id, { prefix: 'la r' })).rejects.toThrow(InvalidPrefixError)
      await expect(store.updateBoard(casa.id, { prefix: 'T' })).rejects.toThrow(PrefixTakenError)
      await expect(store.updateBoard(casa.id, { name: 'ok', prefix: 'T' })).rejects.toThrow(PrefixTakenError)
      expect(await store.boards()).toEqual([SEED_BOARD, { ...casa, name: 'Lar' }])
      expect(await store.updateBoard('nope', { name: 'x' })).toBeNull()
    })

    it('a tarefa de um board não é achada pela chave com o prefixo de outro', async () => {
      const store = make()
      await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      expect(await store.update({ prefix: 'CASA', key: 1 }, { title: 'x' })).toBeNull()
      expect(await store.delete({ prefix: 'CASA', key: 1 })).toBe(false)
    })
    it('nasce com os cinco status fixos, na ordem, e sem tarefa (RN2)', async () => {
      const board = await seedBoard(make())
      expect(board.statuses).toEqual(DEFAULT_STATUSES)
      expect(board.tasks).toEqual([])
    })

    it('cria com a chave seguinte, o título aparado e prioridade "sem"', async () => {
      const store = make()
      const first = await store.create({ boardId: IN, title: '  Comprar café ', statusId: 'todo' })
      const second = await store.create({ boardId: IN, title: 'Ligar pro banco', statusId: 'doing' })

      expect(first).toMatchObject({
        boardId: IN,
        key: 1,
        keyPrefix: 'T',
        body: '',
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
      await store.create({ boardId: IN, title: 'primeira', statusId: 'todo' })
      await store.create({ boardId: IN, title: 'segunda', statusId: 'todo' })

      const { tasks } = await seedBoard(store)
      expect(tasks.map((task) => task.title)).toEqual(['segunda', 'primeira'])
    })

    it('ordena pelo status, na ordem dos status, e depois pelo rank', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'feito', statusId: 'done' })
      await store.create({ boardId: IN, title: 'backlog', statusId: 'backlog' })
      await store.create({ boardId: IN, title: 'a fazer', statusId: 'todo' })

      const { tasks } = await seedBoard(store)
      expect(tasks.map((task) => task.title)).toEqual(['backlog', 'a fazer', 'feito'])
    })

    it('não reaproveita a chave de uma tarefa apagada, nem a da maior (RN5)', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.create({ boardId: IN, title: 'dois', statusId: 'todo' })

      expect(await store.delete(T(2))).toBe(true)
      const third = await store.create({ boardId: IN, title: 'três', statusId: 'todo' })

      expect(third.key).toBe(3)
      expect((await seedBoard(store)).tasks.map((task) => task.key)).toEqual([3, 1])
    })

    it('diz que não apagou nada quando a chave não existe', async () => {
      expect(await make().delete(T(99))).toBe(false)
    })

    it('recusa título vazio e não grava nada (C5)', async () => {
      const store = make()
      await expect(store.create({ boardId: IN, title: '   ', statusId: 'todo' })).rejects.toThrow(
        TitleRequiredError,
      )
      expect((await seedBoard(store)).tasks).toEqual([])
    })

    it('recusa um status que não existe e não gasta a chave', async () => {
      const store = make()
      await expect(store.create({ boardId: IN, title: 'x', statusId: 'nope' })).rejects.toThrow(
        StatusNotFoundError,
      )
      expect((await store.create({ boardId: IN, title: 'y', statusId: 'todo' })).key).toBe(1)
    })

    it('update, placement: troca o status e a ordem, e o board lê a ordem nova (C1, C2)', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.create({ boardId: IN, title: 'dois', statusId: 'doing' })

      const moved = await store.update(T(1), { placement: { statusId: 'doing', rank: 'z' } })

      expect(moved).toMatchObject({ key: 1, statusId: 'doing', rank: 'z' })
      expect((await seedBoard(store)).tasks.map((task) => task.key)).toEqual([2, 1])
    })

    it('update, placement: carimba ao entrar em concluída e apaga ao sair (RN3)', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'doing' })

      const done = await store.update(T(1), { placement: { statusId: 'done', rank: 'i' } })
      expect(done?.completedAt).toEqual(expect.any(String))

      const back = await store.update(T(1), { placement: { statusId: 'doing', rank: 'i' } })
      expect(back?.completedAt).toBeNull()
    })

    it('update, placement: devolve null para uma chave que não existe', async () => {
      expect(await make().update(T(9), { placement: { statusId: 'todo', rank: 'i' } })).toBeNull()
    })

    it('update, placement: recusa status inexistente e rank mal formado, sem mudar nada', async () => {
      const store = make()
      const created = await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      await expect(store.update(T(1), { placement: { statusId: 'nope', rank: 'i' } })).rejects.toThrow(StatusNotFoundError)
      for (const rank of ['', 'a0', 'A', 'a-b']) {
        await expect(store.update(T(1), { placement: { statusId: 'doing', rank } })).rejects.toThrow(InvalidRankError)
      }
      expect((await seedBoard(store)).tasks).toEqual([created])
    })

    it('update: grava título, prioridade e corpo, e o board lê de volta (#22 C2)', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      const updated = await store.update(T(1), { title: '  Novo título ', priority: 2, body: '# notas' })

      expect(updated).toMatchObject({ title: 'Novo título', priority: 2, body: '# notas', statusId: 'todo' })
      expect((await seedBoard(store)).tasks).toEqual([updated])
    })

    it('update: recusa título vazio e prioridade fora de 0 a 4, sem mudar nada (#22 C3)', async () => {
      const store = make()
      const created = await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      await expect(store.update(T(1), { title: '  ' })).rejects.toThrow(TitleRequiredError)
      await expect(store.update(T(1), { priority: 7 as never })).rejects.toThrow(InvalidPriorityError)
      await expect(store.update(T(1), { title: 'ok', placement: { statusId: 'nope', rank: 'i' } })).rejects.toThrow(
        StatusNotFoundError,
      )
      expect((await seedBoard(store)).tasks).toEqual([created])
    })

    it('update: devolve null para uma tarefa apagada (#22 C6)', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.delete(T(1))

      expect(await store.update(T(1), { title: 'x' })).toBeNull()
    })
  })
}
