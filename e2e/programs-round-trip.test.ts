import { afterAll, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from '../server/src/index.js'
import { httpEntryRepository } from '../ui/src/adapters/http-entry-repository.js'
import { httpProgramsClient } from '../ui/src/adapters/http-programs-client.js'

/**
 * A program's comments across a real socket, through the adapter the app uses
 * (programa-comentarios): the payload shape between the two halves, which the
 * adapter's canned answers and the screen's fake cannot catch.
 */
const running: RunningServer[] = []
afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

async function overTheWire() {
  const server = await createServer({ databaseFile: ':memory:' })
  running.push(server)
  const config = { baseUrl: server.url }
  return { programs: httpProgramsClient({ config }), entries: httpEntryRepository({ config }) }
}

describe('Programs, end to end', () => {
  it('C1, C4, C5: a program comment travels as markdown, is deleted for good, and never reaches the Daily Log', async () => {
    const { programs, entries } = await overTheWire()
    const dailly = await programs.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })

    const sent = await programs.addProgramComment(dailly.id, 'ele vem **quinta**')
    expect(sent).toMatchObject({ body: 'ele vem **quinta**' })
    expect(await programs.programComments(dailly.id)).toEqual([sent])
    expect(await entries.list({})).toEqual([])

    expect(await programs.deleteProgramComment(dailly.id, sent!.id)).toBe(true)
    expect(await programs.programComments(dailly.id)).toEqual([])
    expect(await programs.deleteProgramComment(dailly.id, sent!.id)).toBe(false)
  })

  it('C2, C3: an empty body is refused with the API words, and a gone program is null', async () => {
    const { programs } = await overTheWire()
    const dailly = await programs.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })

    await expect(programs.addProgramComment(dailly.id, '   ')).rejects.toThrow('o comentário é obrigatório')
    expect(await programs.programComments('nope')).toBeNull()
    expect(await programs.addProgramComment('nope', 'x')).toBeNull()
    expect(await programs.deleteProgramComment('nope', 'x')).toBe(false)
  })
})
