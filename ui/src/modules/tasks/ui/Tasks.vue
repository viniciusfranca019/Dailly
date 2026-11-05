<script setup lang="ts">
import { placeAt } from '@dailly/tasks-core'
import type { SharedDeps, Task, TaskBoard } from '@shared'
import { computed, onMounted, ref } from 'vue'
import type { TasksDeps } from '../deps.js'
import { firstToDo, groupByStatus } from '../model/list.js'
import BoardColumn from './board/BoardColumn.vue'
import type { Draft } from '../model/draft.js'
import TaskPanel from './detail/TaskPanel.vue'
import StatusGroup from './list/StatusGroup.vue'
import { usePanelWidth } from './panel-width.js'
import { useTasksView } from './view.js'

/**
 * Tasks: the board and the list over the same read (RN4), and the capture
 * under each "+".
 *
 * After every write the screen reads the board again instead of patching it
 * by hand: the server owns the key, the rank and the RN3 stamp, and a refused
 * write then shows what the server has, which is RN7 (the Requests rule).
 */
const props = defineProps<{ deps: SharedDeps & TasksDeps }>()

type Read = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; board: TaskBoard }

const read = ref<Read>({ state: 'loading' })
/** The status whose capture is open, if any. */
const composing = ref<string | null>(null)
/** The last refused move, shown above the board until the next one. */
const moveError = ref<string | null>(null)
/**
 * The card being dragged; HTML5 drag carries no state the board can trust.
 * Cleared on the card's `dragend` too (it fires after the drop): a cancelled
 * drag must not leave a key armed for the next thing dropped on a column.
 */
const grabbed = ref<number | null>(null)
const { view, choose } = useTasksView()
/**
 * The panel's width lives with the page, not with the panel (card #44): the
 * panel is remounted for every task, and without storage (C5) the width must
 * still hold until the reload, not until the panel closes.
 */
const panelWidth = usePanelWidth()
/** The task whose panel is open (card #22). */
const opened = ref<number | null>(null)

const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

async function load(): Promise<void> {
  try {
    read.value = { state: 'ready', board: await props.deps.tasks.board() }
  } catch (cause) {
    read.value = { state: 'failed', message: message(cause, 'não consegui ler as tarefas') }
  }
}

onMounted(load)

const groups = computed(() => (read.value.state === 'ready' ? groupByStatus(read.value.board) : []))
const empty = computed(
  () => read.value.state === 'ready' && read.value.board.tasks.length === 0 && composing.value === null,
)

function inviteFirst(): void {
  if (read.value.state !== 'ready') return
  composing.value = firstToDo(read.value.board)?.id ?? null
}

/** Throws on refusal, so the form keeps what was typed and shows why (C6 of #20). */
async function create(statusId: string, title: string): Promise<void> {
  await props.deps.tasks.create({ title, statusId })
  composing.value = null
  await load()
}

const openedTask = computed(() =>
  read.value.state === 'ready' ? read.value.board.tasks.find((task) => task.key === opened.value) : undefined,
)
/** Kept while the panel is open, so a task deleted elsewhere still has its panel to say so (C6). */
const lastOpened = ref<Task | undefined>(undefined)
const panelTask = computed(() => openedTask.value ?? (opened.value === null ? undefined : lastOpened.value))

function open(key: number): void {
  opened.value = key
  lastOpened.value = read.value.state === 'ready' ? read.value.board.tasks.find((task) => task.key === key) : undefined
}

function close(): void {
  opened.value = null
  lastOpened.value = undefined
}

/**
 * The panel's save: the edited fields, and a placement on top of the new
 * status when the status changed (C8). The board is reread whatever happens
 * (RN7), so a refused save leaves the card and the row as the server has them.
 */
async function save(key: number, draft: Draft): Promise<boolean> {
  if (read.value.state !== 'ready') return false
  const board = read.value.board
  const current = board.tasks.find((task) => task.key === key)
  const top = board.tasks.find((task) => task.statusId === draft.statusId && task.key !== key)?.key ?? null
  try {
    const saved = await props.deps.tasks.update(key, {
      title: draft.title,
      priority: draft.priority,
      body: draft.body,
      ...(current && current.statusId !== draft.statusId
        ? { placement: placeAt(board, key, draft.statusId, top) }
        : {}),
    })
    return saved !== null
  } finally {
    await load()
  }
}

async function remove(key: number): Promise<void> {
  await props.deps.tasks.delete(key)
  close()
  await load()
}

async function drop(statusId: string, beforeKey: number | null): Promise<void> {
  const key = grabbed.value
  grabbed.value = null
  if (key === null || key === beforeKey || read.value.state !== 'ready') return
  moveError.value = null
  try {
    const moved = await props.deps.tasks.update(key, {
      placement: placeAt(read.value.board, key, statusId, beforeKey),
    })
    if (!moved) moveError.value = 'tarefa não encontrada'
  } catch (cause) {
    moveError.value = message(cause, 'não consegui mover a tarefa')
  }
  await load()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="tasks">
    <nav class="flex items-center gap-2 px-6 py-4 text-sm text-[#747e8f]">
      <span>Tasks</span>
      <span class="text-[#1e2638]">/</span>
      <span class="text-gray-300">{{ view === 'board' ? 'Board' : 'Lista' }}</span>
      <div class="ml-auto flex rounded-md border border-[#1e2638] p-0.5" role="group" aria-label="Visualização">
        <button
          v-for="option in (['board', 'list'] as const)"
          :key="option"
          type="button"
          :aria-pressed="view === option ? 'true' : 'false'"
          class="rounded px-2 py-0.5 text-xs"
          :class="view === option ? 'bg-white/10 text-gray-100' : 'text-[#747e8f] hover:text-gray-200'"
          @click="choose(option)"
        >
          {{ option === 'board' ? 'Board' : 'Lista' }}
        </button>
      </div>
    </nav>

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <p v-if="read.state === 'loading'" class="text-sm text-[#747e8f]">Carregando as tarefas…</p>

      <p
        v-else-if="read.state === 'failed'"
        role="alert"
        class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
      >
        {{ read.message }}
      </p>

      <div v-else-if="empty" class="flex flex-col items-center gap-3 py-16 text-center">
        <p class="text-sm text-gray-300">Nenhuma tarefa ainda</p>
        <button
          type="button"
          class="rounded-md bg-[#3b82f6] px-3 py-1.5 text-sm font-medium text-white"
          @click="inviteFirst"
        >
          Criar a primeira tarefa
        </button>
      </div>

      <template v-else>
        <p
          v-if="moveError"
          role="alert"
          class="mb-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ moveError }}
        </p>

        <div v-if="view === 'board'" data-view="board" class="flex items-start gap-4">
          <BoardColumn
            v-for="group in groups"
            :key="group.status.id"
            :group="group"
            :zone="deps.zone"
            :composing="composing === group.status.id"
            :create="create"
            @compose="composing = $event"
            @cancel="composing = null"
            @grab="grabbed = $event"
            @release="grabbed = null"
            @open="open"
            @drop="drop"
          />
        </div>

        <div v-else data-view="list" class="flex flex-col gap-4">
          <StatusGroup
            v-for="group in groups"
            :key="group.status.id"
            :group="group"
            :zone="deps.zone"
            :composing="composing === group.status.id"
            :create="create"
            @compose="composing = $event"
            @cancel="composing = null"
            @open="open"
          />
        </div>
      </template>

      <TaskPanel
        v-if="panelTask && read.state === 'ready'"
        :key="panelTask.key"
        :task="panelTask"
        :statuses="read.board.statuses"
        :save="(draft: Draft) => save(panelTask!.key, draft)"
        :remove="() => remove(panelTask!.key)"
        :width="panelWidth.width.value"
        @resize="panelWidth.follow"
        @resized="panelWidth.settle"
        @close="close"
      />
    </div>
  </div>
</template>
