import { inMemoryTaskStore } from './in-memory-task-store.js'
import { taskStoreContract } from './testing/task-store-contract.js'

let n = 0
taskStoreContract('in-memory', {
  make: (labels = []) =>
    inMemoryTaskStore({
      labels: () => labels,
      newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
      now: () => '2026-11-05T12:00:00.000Z',
    }),
})

describe('inMemoryTaskStore — comentários do programa no mesmo instante (programa-comentarios)', () => {
  it('ficam na ordem em que foram gravados, não na do id', async () => {
    let id = 10
    const store = inMemoryTaskStore({ newId: () => `id-${(id -= 1)}`, now: () => '2026-11-26T12:00:00.000Z' })
    const program = await store.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })

    await store.addProgramComment(program.id, 'liguei pro encanador')
    await store.addProgramComment(program.id, 'ele vem quinta')

    expect((await store.programComments(program.id))?.map((comment) => comment.body)).toEqual([
      'liguei pro encanador',
      'ele vem quinta',
    ])
  })
})
