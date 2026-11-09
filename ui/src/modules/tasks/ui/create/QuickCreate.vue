<script setup lang="ts">
import { PRIORITY_LABELS, formatKey, type Board, type Priority, type TaskStatus } from '@dailly/tasks-core'
import type { SharedDeps } from '@shared'
import { onMounted, ref, watch } from 'vue'
import type { TasksDeps } from '../../deps.js'
import { announceCreated } from '../../model/created.js'
import { firstToDo } from '../../model/list.js'
import { useLastBoard } from '../board-choice.js'

/**
 * The quick create, opened by the shell from C on any screen (card #48, J11):
 * title, status and priority, in the last board used (F4's key). Confirming
 * creates on top of the status and closes; the Tasks screen on that board
 * reads it again, and anywhere else the form leaves "CASA-2 criada".
 *
 * A refusal or an API that is down stays in the form, with the title kept
 * (J11.2a, J11.2b): the rule of the title is the API's, said in its words.
 */
// The shape of `CommandProps` (`@shared`), written out: the SFC compiler
// does not resolve an imported generic in `defineProps`.
const props = defineProps<{
  deps: SharedDeps & TasksDeps
  focusTick: number
  navigate: (route: string) => void
  close: () => void
  notify: (text: string) => void
}>()

const PRIORITIES = [0, 1, 2, 3, 4] as const

const board = ref<Board | null>(null)
const statuses = ref<readonly TaskStatus[]>([])
const title = ref('')
const statusId = ref('')
const priority = ref<Priority>(0)
const error = ref<string | null>(null)
const saving = ref(false)
const field = ref<HTMLInputElement | null>(null)
const lastBoard = useLastBoard()

const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

onMounted(async () => {
  field.value?.focus()
  try {
    const boards = await props.deps.tasks.boards()
    const picked = boards.find((candidate) => candidate.id === lastBoard.pick(boards))
    const read = picked ? await props.deps.tasks.board(picked.id) : null
    if (!picked || !read) throw new Error('board não encontrado')
    board.value = picked
    statuses.value = read.statuses
    statusId.value = firstToDo(read)?.id ?? ''
  } catch (cause) {
    error.value = message(cause, 'não consegui ler o board')
  }
})
watch(
  () => props.focusTick,
  () => field.value?.focus(),
)

async function submit(): Promise<void> {
  if (saving.value || !board.value) return
  saving.value = true
  try {
    const task = await props.deps.tasks.create({
      boardId: board.value.id,
      title: title.value,
      statusId: statusId.value,
      priority: priority.value,
    })
    if (!announceCreated(task)) props.notify(`${formatKey(task.keyPrefix, task.key)} criada`)
    props.close()
  } catch (cause) {
    error.value = message(cause, 'não consegui criar a tarefa')
    field.value?.focus()
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    props.close()
  }
}
</script>

<template>
  <div
    role="dialog"
    :aria-label="board ? `Nova tarefa em ${board.name}` : 'Nova tarefa'"
    aria-modal="true"
    class="w-[36rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#1e2638] bg-[#0b101b] shadow-2xl"
    @keydown="onKeydown"
  >
    <form @submit.prevent="submit">
      <p class="px-4 pt-3 text-xs text-[#747e8f]">{{ board?.name ?? '…' }} › Nova tarefa</p>
      <input
        ref="field"
        v-model="title"
        type="text"
        aria-label="Título"
        placeholder="Título da tarefa"
        class="w-full bg-transparent px-4 py-3 text-base text-gray-100 outline-none"
      />
      <p v-if="error" role="alert" class="px-4 pb-2 text-sm text-red-300">{{ error }}</p>
      <div class="flex items-center gap-2 border-t border-[#1e2638] px-4 py-3 text-sm">
        <select
          v-model="statusId"
          aria-label="Status"
          class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-gray-100"
        >
          <option v-for="status in statuses" :key="status.id" :value="status.id">{{ status.name }}</option>
        </select>
        <select
          v-model.number="priority"
          aria-label="Prioridade"
          class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-gray-100"
        >
          <option v-for="level in PRIORITIES" :key="level" :value="level">{{ PRIORITY_LABELS[level] }}</option>
        </select>
        <button
          type="submit"
          :disabled="saving || !board"
          class="ml-auto rounded-md bg-indigo-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Criar tarefa
        </button>
      </div>
    </form>
  </div>
</template>
