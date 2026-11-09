import { EntryNotFoundError, LABEL_COLORS, createEntry, systemClock, updateEntry, uuidIds, type Clock, type Entry, type IdGenerator, type Label } from '@dailly/domain'
import { dayOf, timeOf } from '@dailly/periods'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Api } from './api.js'
import { answer } from './answer.js'
import { httpEntries } from './entries.js'
import type { LabelBook } from './labels.js'

/**
 * The Daily Log tools (card #58): read, write, correct and delete the day's
 * entries, and the global labels. A write runs the screen's use-cases, so the
 * body is normalized once, here, and the server only validates (architecture,
 * "Os use-cases rodam no renderer").
 *
 * "Today" and every day shown are the API's zone (`/health`), through
 * `@dailly/periods`, the one place a zone is converted.
 */
export interface DailyLogDeps {
  readonly clock?: Clock
  readonly ids?: IdGenerator
}

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a forma é YYYY-MM-DD')

export function registerDailyLogTools(server: McpServer, api: Api, labels: LabelBook, { clock = systemClock, ids = uuidIds }: DailyLogDeps = {}): void {
  const entries = httpEntries(api)
  const zone = async () => ((await api('/health')) as { zone: string }).zone

  const view = (entry: Entry, inZone: string, all: readonly Label[]) => ({
    id: entry.id,
    body: entry.body,
    day: dayOf(entry.occurredAt, inZone),
    time: timeOf(entry.occurredAt, inZone),
    occurredAt: entry.occurredAt,
    labels: labels.namesOf(entry.labelIds, all),
    props: entry.props,
    updatedAt: entry.updatedAt,
  })

  async function shown(entry: Entry) {
    const [inZone, all] = await Promise.all([zone(), labels.list()])
    return view(entry, inZone, all)
  }

  const orMissing = async <T>(id: string, call: () => Promise<T>): Promise<T> => {
    try {
      return await call()
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw new Error(`o registro ${id} não existe`)
      throw error
    }
  }

  server.registerTool(
    'list_entries',
    {
      title: 'Ler o Daily Log',
      description: 'Os registros de um período (dias YYYY-MM-DD, no fuso da API); sem período, os de hoje. Filtra por labels (pelo nome, qualquer uma) e por propriedades.',
      inputSchema: {
        from: DAY.optional(),
        to: DAY.optional(),
        labels: z.array(z.string()).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, labels: names, props }) => {
      const [inZone, all] = await Promise.all([zone(), labels.list()])
      const today = dayOf(clock.now(), inZone)
      const found = await entries.list({
        // Only `to`: that one day; only `from`: up to today; neither: today.
        from: from ?? to ?? today,
        to: to ?? today,
        ...(names?.length ? { labelIds: await labels.idsOf(names, all) } : {}),
        ...(props ? { props } : {}),
      })
      return answer(found.map((entry) => view(entry, inZone, all)))
    },
  )

  server.registerTool(
    'get_entry',
    { title: 'Ler um registro', description: 'Um registro do Daily Log, pelo id.', inputSchema: { id: z.string() }, annotations: { readOnlyHint: true } },
    async ({ id }) => {
      const entry = await entries.getById(id)
      if (!entry) throw new Error(`o registro ${id} não existe`)
      return answer(await shown(entry))
    },
  )

  server.registerTool(
    'create_entry',
    {
      title: 'Registrar no Daily Log',
      description: 'Registra um fato do dia, em markdown. Sem occurredAt (ISO 8601), é agora. Labels pelo nome, das que existem; propriedades pelas definições da tela.',
      inputSchema: {
        body: z.string(),
        occurredAt: z.iso.datetime({ offset: true }).optional(),
        labels: z.array(z.string()).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { destructiveHint: false },
    },
    async ({ body, occurredAt, labels: names, props }) => {
      const created = await createEntry({ entries, clock, ids })({
        body,
        ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
        ...(names?.length ? { labelIds: await labels.idsOf(names) } : {}),
        ...(props ? { props } : {}),
      })
      return answer(await shown(created))
    },
  )

  server.registerTool(
    'update_entry',
    {
      title: 'Corrigir um registro',
      description: 'Corrige o texto, o instante, as labels (o conjunto inteiro, pelo nome) ou as propriedades de um registro. O que não vier fica como está.',
      inputSchema: {
        id: z.string(),
        body: z.string().optional(),
        occurredAt: z.iso.datetime({ offset: true }).optional(),
        labels: z.array(z.string()).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { destructiveHint: false },
    },
    async ({ id, body, occurredAt, labels: names, props }) => {
      const current = await entries.getById(id)
      if (!current) throw new Error(`o registro ${id} não existe`)
      const corrected = await orMissing(id, async () =>
        updateEntry({ entries, clock })(id, {
          // The use-case always takes the body: the one kept is the one stored.
          body: body ?? current.body,
          ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
          ...(names ? { labelIds: await labels.idsOf(names) } : {}),
          ...(props ? { props } : {}),
        }),
      )
      return answer(await shown(corrected))
    },
  )

  server.registerTool(
    'delete_entry',
    { title: 'Apagar um registro', description: 'Apaga um registro do Daily Log. Não volta.', inputSchema: { id: z.string() }, annotations: { destructiveHint: true } },
    async ({ id }) => {
      await orMissing(id, () => entries.delete(id))
      return answer({ deleted: id })
    },
  )

  server.registerTool(
    'list_labels',
    { title: 'Listar labels', description: 'As labels globais, as mesmas do Daily Log e do Tasks, com a cor.', annotations: { readOnlyHint: true } },
    async () => answer(await labels.list()),
  )

  server.registerTool(
    'create_label',
    {
      title: 'Criar label',
      description: 'Cria uma label global. Sem cor, a primeira da paleta que nenhuma outra usa.',
      inputSchema: { name: z.string(), color: z.enum(LABEL_COLORS).optional() },
      annotations: { destructiveHint: false },
    },
    async ({ name, color }) => answer(await labels.create(name, color)),
  )
}
