import {
  PRIORITY_LABELS,
  formatKey,
  parseKey,
  placeAt,
  type Board,
  type Priority,
  type Task,
  type TaskBoard,
  type TaskComment,
  type TaskKey,
  type TaskSearchResult,
  type TaskStatus,
} from '@dailly/tasks-core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ApiRefusal, type Api } from './api.js'
import { answer } from './answer.js'

/**
 * The Tasks tools (card #57): read boards and tasks, and create, change, move
 * and delete tasks and their comments. Boards and statuses are not created
 * here; that stays on the screen.
 *
 * A board or a status is named the way a person would, by name without case,
 * or by id. A move goes on top of its column with the same `placeAt` the
 * screen uses, so the rank rule has one home.
 */
const PRIORITY_NAMES = Object.values(PRIORITY_LABELS) as [string, ...string[]]
const priorityOf = (name: string): Priority =>
  Number(Object.entries(PRIORITY_LABELS).find(([, label]) => label === name)![0]) as Priority

const same = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0

function keyOf(text: string): TaskKey {
  const key = parseKey(text.trim().toUpperCase())
  if (!key) throw new Error(`chave inválida: "${text}" (a forma é CASA-12)`)
  return key
}
const taskPath = (key: TaskKey) => `/tasks/${encodeURIComponent(formatKey(key.prefix, key.key))}`

/** A task in the words of the screen: the key whole, and the status and the priority by name. */
function view(task: Task, statuses: readonly TaskStatus[]) {
  return {
    key: formatKey(task.keyPrefix, task.key),
    title: task.title,
    status: statuses.find((status) => status.id === task.statusId)?.name ?? task.statusId,
    statusId: task.statusId,
    priority: PRIORITY_LABELS[task.priority],
    body: task.body,
    labelIds: task.labelIds,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
  }
}

export function registerTaskTools(server: McpServer, api: Api): void {
  const boards = async () => (await api('/boards')) as Board[]

  async function boardNamed(name: string | undefined): Promise<Board> {
    const all = await boards()
    const found = name === undefined ? all[0] : all.find((board) => board.id === name || same(board.name, name))
    if (!found) throw new Error(`não existe o board "${name}"; os boards são: ${all.map((board) => board.name).join(', ')}`)
    return found
  }

  const readBoard = async (board: Board) => (await api(`/tasks?boardId=${encodeURIComponent(board.id)}`)) as TaskBoard

  function statusNamed(read: TaskBoard, name: string | undefined, board: Board): TaskStatus {
    const found =
      name === undefined
        ? (read.statuses.find((status) => status.category === 'unstarted') ?? read.statuses[0])
        : read.statuses.find((status) => status.id === name || same(status.name, name))
    if (!found) {
      throw new Error(`o board "${board.name}" não tem o status "${name}"; os status são: ${read.statuses.map((status) => status.name).join(', ')}`)
    }
    return found
  }

  /** The board a key lives in: the search finds the exact key first, in any board (card #47). */
  async function boardOfKey(key: TaskKey): Promise<{ board: Board; read: TaskBoard }> {
    const text = formatKey(key.prefix, key.key)
    const { results } = (await api(`/tasks/search?q=${encodeURIComponent(text)}`)) as { results: TaskSearchResult[] }
    const hit = results.find((result) => result.keyPrefix === key.prefix && result.key === key.key)
    if (!hit) throw new Error(`a tarefa ${text} não existe`)
    const board = await boardNamed(hit.boardId)
    return { board, read: await readBoard(board) }
  }

  /** A 404 named after what the person asked for, not the route. */
  async function orMissing<T>(call: () => Promise<T>, what: string): Promise<T> {
    try {
      return await call()
    } catch (error) {
      if (error instanceof ApiRefusal && error.status === 404) throw new Error(`${what} não existe`)
      throw error
    }
  }

  const keyArg = z.string().describe('A chave da tarefa, como CASA-12')
  const boardArg = z.string().describe('O board, pelo nome (sem caixa) ou pelo id')

  server.registerTool(
    'list_boards',
    { title: 'Listar boards', description: 'Os boards do Tasks, com o prefixo das chaves de cada um.', annotations: { readOnlyHint: true } },
    async () => answer(await boards()),
  )

  server.registerTool(
    'get_board',
    {
      title: 'Ler um board',
      description: 'Os status de um board e as tarefas dele, na ordem da tela: por status, e dentro do status, de cima para baixo.',
      inputSchema: { board: boardArg },
      annotations: { readOnlyHint: true },
    },
    async ({ board: name }) => {
      const board = await boardNamed(name)
      const read = await readBoard(board)
      return answer({
        board,
        statuses: read.statuses.map(({ id, name: status, category }) => ({ id, name: status, category })),
        tasks: read.tasks.map((task) => view(task, read.statuses)),
      })
    },
  )

  server.registerTool(
    'search_tasks',
    {
      title: 'Buscar tarefas',
      description: 'Acha tarefas de todos os boards pela chave (CASA-3) ou por parte do título.',
      inputSchema: { text: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ text }) => {
      const { results } = (await api(`/tasks/search?q=${encodeURIComponent(text)}`)) as { results: TaskSearchResult[] }
      return answer(results.map((hit) => ({ key: formatKey(hit.keyPrefix, hit.key), title: hit.title, board: hit.boardName })))
    },
  )

  server.registerTool(
    'create_task',
    {
      title: 'Criar tarefa',
      description: 'Cria uma tarefa no topo do status. Sem board, vai para o primeiro ("Tasks"); sem status, para o primeiro "a fazer"; sem prioridade, nasce "sem".',
      inputSchema: {
        title: z.string(),
        board: boardArg.optional(),
        status: z.string().describe('O status, pelo nome ou pelo id').optional(),
        priority: z.enum(PRIORITY_NAMES).optional(),
      },
      annotations: { destructiveHint: false },
    },
    async ({ title, board: boardName, status: statusName, priority }) => {
      const board = await boardNamed(boardName)
      const read = await readBoard(board)
      const status = statusNamed(read, statusName, board)
      const task = (await api('/tasks', {
        method: 'POST',
        body: { boardId: board.id, title, statusId: status.id, ...(priority ? { priority: priorityOf(priority) } : {}) },
      })) as Task
      return answer(view(task, read.statuses))
    },
  )

  server.registerTool(
    'update_task',
    {
      title: 'Mudar tarefa',
      description: 'Muda o título, o corpo (markdown), a prioridade, as labels (ids, o conjunto inteiro) e o status, numa gravação. Um status novo põe a tarefa no topo dele.',
      inputSchema: {
        key: keyArg,
        title: z.string().optional(),
        body: z.string().optional(),
        status: z.string().describe('O status, pelo nome ou pelo id').optional(),
        priority: z.enum(PRIORITY_NAMES).optional(),
        labelIds: z.array(z.string()).optional(),
      },
      annotations: { destructiveHint: false },
    },
    async ({ key: text, title, body, status: statusName, priority, labelIds }) => {
      const key = keyOf(text)
      const { board, read } = await boardOfKey(key)
      const current = read.tasks.find((task) => task.keyPrefix === key.prefix && task.key === key.key)
      let placement: { statusId: string; rank: string } | undefined
      if (statusName !== undefined && current) {
        const status = statusNamed(read, statusName, board)
        if (status.id !== current.statusId) {
          const top = read.tasks.find((task) => task.statusId === status.id && task.key !== current.key)?.key ?? null
          placement = placeAt(read, current.key, status.id, top)
        }
      }
      const task = (await orMissing(
        () =>
          api(taskPath(key), {
            method: 'PATCH',
            body: {
              ...(title !== undefined ? { title } : {}),
              ...(body !== undefined ? { body } : {}),
              ...(priority !== undefined ? { priority: priorityOf(priority) } : {}),
              ...(labelIds !== undefined ? { labelIds } : {}),
              ...(placement ?? {}),
            },
          }),
        `a tarefa ${formatKey(key.prefix, key.key)}`,
      )) as Task
      return answer(view(task, read.statuses))
    },
  )

  server.registerTool(
    'delete_task',
    { title: 'Apagar tarefa', description: 'Apaga a tarefa e os comentários dela. Não volta.', inputSchema: { key: keyArg }, annotations: { destructiveHint: true } },
    async ({ key: text }) => {
      const key = keyOf(text)
      const name = formatKey(key.prefix, key.key)
      await orMissing(() => api(taskPath(key), { method: 'DELETE' }), `a tarefa ${name}`)
      return answer({ deleted: name })
    },
  )

  server.registerTool(
    'list_comments',
    { title: 'Ler comentários', description: 'Os comentários da tarefa, do mais antigo ao mais novo.', inputSchema: { key: keyArg }, annotations: { readOnlyHint: true } },
    async ({ key: text }) => {
      const key = keyOf(text)
      return answer((await orMissing(() => api(`${taskPath(key)}/comments`), `a tarefa ${formatKey(key.prefix, key.key)}`)) as TaskComment[])
    },
  )

  server.registerTool(
    'add_comment',
    {
      title: 'Comentar tarefa',
      description: 'Acrescenta um comentário (markdown) à tarefa.',
      inputSchema: { key: keyArg, body: z.string() },
      annotations: { destructiveHint: false },
    },
    async ({ key: text, body }) => {
      const key = keyOf(text)
      const comment = await orMissing(
        () => api(`${taskPath(key)}/comments`, { method: 'POST', body: { body } }),
        `a tarefa ${formatKey(key.prefix, key.key)}`,
      )
      return answer(comment as TaskComment)
    },
  )

  server.registerTool(
    'delete_comment',
    {
      title: 'Apagar comentário',
      description: 'Apaga um comentário da tarefa, pelo id. Não volta.',
      inputSchema: { key: keyArg, id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ key: text, id }) => {
      const key = keyOf(text)
      await orMissing(() => api(`${taskPath(key)}/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }), `o comentário ${id} da tarefa ${formatKey(key.prefix, key.key)}`)
      return answer({ deleted: id })
    },
  )
}
