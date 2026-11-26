import type { ProgramWithTasks, TaskComment } from '@dailly/tasks-core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Api } from './api.js'
import { answer } from './answer.js'

/**
 * The Programs tools (programa-comentarios): find a program and read, write
 * and delete its own comments, so the next session of a program reads what was
 * said on it. Creating a program, taking tasks into it and focus stay on the
 * screen.
 *
 * A program is named by its id, as a task is by its key: the name can change,
 * the id cannot. `list_programs` is where a session finds the id. The API's
 * refusals ("programa não encontrado", "o comentário é obrigatório") reach the
 * tool as they are.
 */
export function registerProgramTools(server: McpServer, api: Api): void {
  const programArg = z.string().describe('O id do programa, como list_programs o dá')
  const commentsPath = (program: string) => `/programs/${encodeURIComponent(program)}/comments`

  server.registerTool(
    'list_programs',
    {
      title: 'Listar programas',
      description: 'Os programas, por ordem de criação: id, nome, objetivo, janela, "sai quando", foco e as tarefas (chave, título e status).',
      annotations: { readOnlyHint: true },
    },
    async () => answer((await api('/programs')) as ProgramWithTasks[]),
  )

  server.registerTool(
    'list_program_comments',
    {
      title: 'Ler comentários do programa',
      description: 'Os comentários do próprio programa, do mais antigo ao mais novo. Não traz os das tarefas dele.',
      inputSchema: { program: programArg },
      annotations: { readOnlyHint: true },
    },
    async ({ program }) => answer((await api(commentsPath(program))) as TaskComment[]),
  )

  server.registerTool(
    'add_program_comment',
    {
      title: 'Comentar programa',
      description: 'Acrescenta um comentário (markdown) ao programa.',
      inputSchema: { program: programArg, body: z.string() },
      annotations: { destructiveHint: false },
    },
    async ({ program, body }) => answer((await api(commentsPath(program), { method: 'POST', body: { body } })) as TaskComment),
  )

  server.registerTool(
    'delete_program_comment',
    {
      title: 'Apagar comentário do programa',
      description: 'Apaga um comentário do programa, pelo id. Não volta.',
      inputSchema: { program: programArg, id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ program, id }) => {
      await api(`${commentsPath(program)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return answer({ deleted: id })
    },
  )
}
