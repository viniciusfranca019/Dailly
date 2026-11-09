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
  InvalidColorError,
  InvalidMoveToError,
  LastStatusError,
  SEED_STATUS_IDS,
  STATUS_SEED,
  StatusHasTasksError,
  StatusNameTakenError,
  seedStatusesFor,
} from '../status.js'
import {
  InvalidLabelError,
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

/**
 * `make` builds an empty store; `labels` are the ids of the global labels that
 * exist for it (card #46), which the store only reads.
 */
export function taskStoreContract(
  label: string,
  { make }: { make: (labels?: readonly string[]) => TaskStore },
): void {
  describe(`${label} — contrato do TaskStore`, () => {
    it('#46 C1, C6: aplica e tira labels da tarefa, e o board lê de volta (RN13)', async () => {
      const store = make(['trabalho', 'casa'])
      const created = await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      expect(created.labelIds).toEqual([])

      const tagged = await store.update(T(1), { labelIds: ['trabalho', 'casa'] })
      expect([...(tagged?.labelIds ?? [])].sort()).toEqual(['casa', 'trabalho'])
      expect([...((await seedBoard(store)).tasks[0]?.labelIds ?? [])].sort()).toEqual(['casa', 'trabalho'])

      const untagged = await store.update(T(1), { labelIds: ['casa'] })
      expect(untagged?.labelIds).toEqual(['casa'])
      expect((await seedBoard(store)).tasks[0]?.labelIds).toEqual(['casa'])
      expect((await store.update(T(1), { title: 'dois' }))?.labelIds).toEqual(['casa'])
    })

    it('#46 C7: recusa uma label que não existe, e a tarefa continua com as que tinha', async () => {
      const store = make(['trabalho'])
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })
      await store.update(T(1), { labelIds: ['trabalho'] })

      await expect(store.update(T(1), { labelIds: ['nao-existe'] })).rejects.toThrow(InvalidLabelError)
      await expect(store.update(T(1), { title: 'x', labelIds: ['trabalho', 'nao-existe'] })).rejects.toThrow(
        'contém uma label que não existe',
      )
      expect((await seedBoard(store)).tasks[0]).toMatchObject({ title: 'um', labelIds: ['trabalho'] })
    })

    it('#47 C4: acha pela chave, em qualquer caixa, mesmo com o prefixo antigo do board (RN5)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const todo = await statusNamed(store, casa.id, 'A fazer')
      for (const title of ['um', 'dois', 'Trocar a lâmpada']) await store.create({ boardId: casa.id, title, statusId: todo.id })
      await store.updateBoard(casa.id, { prefix: 'LAR' })
      for (const title of ['a', 'b', 'Pagar o condomínio']) await store.create({ boardId: IN, title, statusId: 'todo' })

      expect(await store.search('casa-3')).toEqual([
        { key: 3, keyPrefix: 'CASA', title: 'Trocar a lâmpada', boardId: casa.id, boardName: 'Casa' },
      ])
    })

    it('#47 C5: acha por parte do título em todos os boards, a mais recente primeiro', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.create({ boardId: IN, title: 'Comprar café', statusId: 'todo' })
      await store.create({ boardId: casa.id, title: 'Café da manhã de domingo', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

      const found = await store.search('café')

      expect(found.map((result) => [`${result.keyPrefix}-${result.key}`, result.title, result.boardName])).toEqual([
        ['CASA-1', 'Café da manhã de domingo', 'Casa'],
        ['T-1', 'Comprar café', 'Tasks'],
      ])
    })

    it('#47 C6: nada bate, e o texto vazio não acha nada', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'Comprar café', statusId: 'todo' })

      expect(await store.search('orçamento')).toEqual([])
      expect(await store.search('   ')).toEqual([])
    })

    it('#47: a chave exata vem antes dos títulos, % e _ são letras, e são no máximo 20', async () => {
      const store = make()
      await store.create({ boardId: IN, title: 'Ver o T-2 depois', statusId: 'todo' })
      await store.create({ boardId: IN, title: 'Resposta', statusId: 'todo' })
      await store.create({ boardId: IN, title: '100% pronto', statusId: 'todo' })
      for (let n = 0; n < 25; n += 1) await store.create({ boardId: IN, title: `item ${n}`, statusId: 'todo' })

      expect((await store.search('t-2')).map((result) => result.title)).toEqual(['Resposta', 'Ver o T-2 depois'])
      expect((await store.search('%')).map((result) => result.title)).toEqual(['100% pronto'])
      expect(await store.search('i_em')).toEqual([])
      expect(await store.search('item')).toHaveLength(20)
    })

    const names = async (store: TaskStore, boardId: string) =>
      (await store.board(boardId))?.statuses.map((status) => status.name)
    const statusNamed = async (store: TaskStore, boardId: string, name: string) => {
      const found = (await store.board(boardId))?.statuses.find((status) => status.name === name)
      if (!found) throw new Error(`no status ${name}`)
      return found
    }

    it('#43 C1: um status novo entra depois dos da sua categoria, com a cor (RN2, RN11)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })

      const review = await store.addStatus(casa.id, { name: ' Revisão ', category: 'started', color: 'purple' })

      expect(review).toMatchObject({ name: 'Revisão', category: 'started', color: 'purple', boardId: casa.id, position: 3 })
      expect(await names(store, casa.id)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Revisão', 'Feito', 'Cancelado'])
      expect((await store.board(casa.id))?.statuses.map((status) => status.position)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('#43 C2: recusa nome vazio, nome repetido no board e cor fora da paleta, e não grava nada', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })

      await expect(store.addStatus(casa.id, { name: ' ', category: 'started', color: 'purple' })).rejects.toThrow(
        NameRequiredError,
      )
      await expect(store.addStatus(casa.id, { name: 'feito', category: 'completed', color: 'blue' })).rejects.toThrow(
        new StatusNameTakenError('feito').message,
      )
      await expect(
        store.addStatus(casa.id, { name: 'x', category: 'started', color: 'magenta' as never }),
      ).rejects.toThrow(InvalidColorError)
      expect(await names(store, casa.id)).toHaveLength(5)
      expect(await store.addStatus('nope', { name: 'x', category: 'started', color: 'purple' })).toBeNull()
    })

    it('#43 C3: cada board nasce com os seus cinco status, sem os que outro ganhou (RN11)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.addStatus(casa.id, { name: 'Revisão', category: 'started', color: 'purple' })

      const lar = await store.createBoard({ name: 'Lar', prefix: 'LAR' })

      expect(await names(store, lar.id)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado'])
      expect(await names(store, casa.id)).toContain('Revisão')
      const ids = (await store.board(lar.id))!.statuses.map((status) => status.id)
      expect(ids.some((id) => (SEED_STATUS_IDS as readonly string[]).includes(id))).toBe(false)
    })

    it('#43 C4: renomear e trocar a cor não mexe nas tarefas (RN2)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const done = await statusNamed(store, casa.id, 'Feito')
      const task = await store.create({ boardId: casa.id, title: 'um', statusId: done.id })
      const closed = await store.update({ prefix: 'CASA', key: task.key }, { placement: { statusId: done.id, rank: 'i' } })

      expect(await store.updateStatus(done.id, { name: 'Entregue', color: 'green' })).toEqual({
        ...done,
        name: 'Entregue',
        color: 'green',
      })
      expect((await store.board(casa.id))?.tasks).toEqual([closed])
      await expect(store.updateStatus(done.id, { name: 'fazendo' })).rejects.toThrow(StatusNameTakenError)
      await expect(store.updateStatus(done.id, { name: '' })).rejects.toThrow(NameRequiredError)
      expect(await store.updateStatus(done.id, { name: 'Entregue' })).toMatchObject({ name: 'Entregue' })
      expect(await store.updateStatus('nope', { name: 'x' })).toBeNull()
    })

    it('#43 C5: apaga um status sem tarefas', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const review = await store.addStatus(casa.id, { name: 'Revisão', category: 'started', color: 'purple' })

      expect(await store.deleteStatus(review!.id)).toBe(true)
      expect(await names(store, casa.id)).not.toContain('Revisão')
      expect(await store.deleteStatus(review!.id)).toBe(false)
    })

    it('#43 C6: o último status do board não se apaga (RN11)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const statuses = (await store.board(casa.id))!.statuses
      for (const status of statuses.filter((candidate) => candidate.name !== 'A fazer')) {
        await store.deleteStatus(status.id)
      }
      const todo = await statusNamed(store, casa.id, 'A fazer')

      await expect(store.deleteStatus(todo.id)).rejects.toThrow(LastStatusError)
      expect(await names(store, casa.id)).toEqual(['A fazer'])
    })

    it('#43 C7: as tarefas do status apagado vão ao topo do destino, na ordem, pelo RN3 (RN12)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const review = (await store.addStatus(casa.id, { name: 'Revisão', category: 'started', color: 'purple' }))!
      const done = await statusNamed(store, casa.id, 'Feito')
      const third = await store.create({ boardId: casa.id, title: 'três', statusId: done.id })
      const second = await store.create({ boardId: casa.id, title: 'dois', statusId: review.id })
      const first = await store.create({ boardId: casa.id, title: 'um', statusId: review.id })

      expect(await store.deleteStatus(review.id, done.id)).toBe(true)

      const read = (await store.board(casa.id))!
      expect(read.statuses.map((status) => status.name)).not.toContain('Revisão')
      const inDone = read.tasks.filter((task) => task.statusId === done.id)
      expect(inDone.map((task) => task.title)).toEqual(['um', 'dois', 'três'])
      expect(inDone.map((task) => task.key)).toEqual([first.key, second.key, third.key])
      expect(inDone[0]?.completedAt).toEqual(expect.any(String))
      expect(inDone[1]?.completedAt).toEqual(expect.any(String))
    })

    it('#43 C9: não apaga um status com tarefas sem destino, nem com um destino que não serve', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      const review = (await store.addStatus(casa.id, { name: 'Revisão', category: 'started', color: 'purple' }))!
      await store.create({ boardId: casa.id, title: 'um', statusId: review.id })

      await expect(store.deleteStatus(review.id)).rejects.toThrow(StatusHasTasksError)
      await expect(store.deleteStatus(review.id)).rejects.toThrow('o status tem tarefas: escolha para onde elas vão')
      for (const moveTo of [review.id, 'nope', 'todo']) {
        await expect(store.deleteStatus(review.id, moveTo)).rejects.toThrow(InvalidMoveToError)
      }
      expect((await store.board(casa.id))?.tasks.map((task) => task.statusId)).toEqual([review.id])
    })

    it('#43: uma tarefa só nasce ou se move num status do próprio board', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      await store.create({ boardId: IN, title: 'um', statusId: 'todo' })

      await expect(store.create({ boardId: casa.id, title: 'x', statusId: 'todo' })).rejects.toThrow(StatusNotFoundError)
      const casaTodo = await statusNamed(store, casa.id, 'A fazer')
      await expect(store.update(T(1), { placement: { statusId: casaTodo.id, rank: 'i' } })).rejects.toThrow(
        StatusNotFoundError,
      )
    })

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
      const read = await store.board(casa.id)
      expect(read?.tasks).toEqual([])
      expect(read?.statuses.map(({ name, category, color, boardId }) => ({ name, category, color, boardId }))).toEqual(
        STATUS_SEED.map((seed) => ({ ...seed, boardId: casa.id })),
      )
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
      await store.create({ boardId: casa.id, title: 'Trocar a lâmpada', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

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

    it('#48 C3: cria com a prioridade escolhida, e sem ela nasce "sem" (RN8)', async () => {
      const store = make()

      const chosen = await store.create({ boardId: IN, title: 'Comprar tinta', statusId: 'todo', priority: 2 })
      const plain = await store.create({ boardId: IN, title: 'Lavar o carro', statusId: 'todo' })

      expect(chosen.priority).toBe(2)
      expect(plain.priority).toBe(0)
      const read = await seedBoard(store)
      expect(read.tasks.find((task) => task.key === chosen.key)?.priority).toBe(2)
    })

    it('#48: recusa uma prioridade fora de 0 a 4, e não gasta a chave', async () => {
      const store = make()

      await expect(
        store.create({ boardId: IN, title: 'x', statusId: 'todo', priority: 7 as never }),
      ).rejects.toThrow(InvalidPriorityError)

      expect((await store.create({ boardId: IN, title: 'y', statusId: 'todo' })).key).toBe(1)
    })

    it('C6: a chave é sequencial dentro do board, independente dos outros (RN5)', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      for (let n = 0; n < 7; n += 1) await store.create({ boardId: IN, title: `t${n}`, statusId: 'todo' })
      await store.create({ boardId: casa.id, title: 'um', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })
      await store.create({ boardId: casa.id, title: 'dois', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

      const third = await store.create({ boardId: casa.id, title: 'Comprar tinta', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

      expect(third).toMatchObject({ keyPrefix: 'CASA', key: 3, boardId: casa.id })
      expect((await store.board(casa.id))?.tasks[0]?.title).toBe('Comprar tinta')
    })

    it('C7: trocar o prefixo vale só para as tarefas novas, e a chave antiga continua achando a tarefa', async () => {
      const store = make()
      const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
      for (const title of ['um', 'dois', 'três']) await store.create({ boardId: casa.id, title, statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

      expect(await store.updateBoard(casa.id, { prefix: 'LAR' })).toEqual({ ...casa, prefix: 'LAR' })
      const fourth = await store.create({ boardId: casa.id, title: 'Pintar a sala', statusId: (await statusNamed(store, casa.id, 'A fazer')).id })

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
      expect(board.statuses).toEqual(seedStatusesFor(IN, SEED_STATUS_IDS))
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
