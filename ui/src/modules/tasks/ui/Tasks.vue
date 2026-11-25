<script setup lang="ts">
import { FOCUS_LEVELS, parseKey, placeAt, type FocusBoard, type FocusLevel, type ProgramWithTasks } from '@dailly/tasks-core'
import type { Board, Label, SharedDeps, StatusColor, Task, TaskBoard, TaskKey, TaskStatus } from '@shared'
import { findByName, nextColor, normalizeLabelName } from '@dailly/domain'
import type { StatusCategory } from '@dailly/tasks-core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TasksDeps } from '../deps.js'
import { LabelFilter } from '@capabilities/labels'
import { onTaskCreated } from '../model/created.js'
import { filterByLabels } from '../model/label-filter.js'
import { filterByFocus, filterByPrograms } from '../model/scope-filter.js'
import { firstToDo, groupByStatus } from '../model/list.js'
import { onOpenRequest, takeOpen } from '../model/open-request.js'
import BoardColumn from './board/BoardColumn.vue'
import type { Draft } from '../model/draft.js'
import { useLastBoard } from './board-choice.js'
import BoardForm from './boards/BoardForm.vue'
import TaskPanel from './detail/TaskPanel.vue'
import FocusView from './programs/FocusView.vue'
import ProgramsView from './programs/ProgramsView.vue'
import ScopeFilter from './programs/ScopeFilter.vue'
import StatusDelete from './statuses/StatusDelete.vue'
import StatusForm from './statuses/StatusForm.vue'
import StatusGroup from './list/StatusGroup.vue'
import { usePanelWidth } from './panel-width.js'
import { useTasksView, type TasksView } from './view.js'

/**
 * Tasks: the board and the list over the same read (RN4), and the capture
 * under each "+".
 *
 * After every write the screen reads the board again instead of patching it
 * by hand: the server owns the key, the rank and the RN3 stamp, and a refused
 * write then shows what the server has, which is RN7 (the Requests rule).
 *
 * The screen shows one board at a time (card #42): the boards are read first,
 * the last one used is reopened (C5), and every read and write is scoped to
 * it. Inside a board the number of a key is unique, so the screen keeps
 * `key` as the card's identity and adds the prefix only when it calls the API.
 */
const props = defineProps<{ deps: SharedDeps & TasksDeps }>()

type Read = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; board: TaskBoard }

const read = ref<Read>({ state: 'loading' })
/** The global labels (card #46), read with the board. */
const labels = ref<readonly Label[]>([])
/** Whether `labels` came from a read that succeeded (and not the empty start or a failure). */
const labelsRead = ref(false)
const boards = ref<readonly Board[]>([])
/** The board on the screen. */
const current = ref<string | null>(null)
const lastBoard = useLastBoard()
/** Which board form is open, if any. */
const editing = ref<'create' | 'edit' | null>(null)
/** The status dialog open, if any (card #43): add, edit or delete. */
type StatusDialog = { mode: 'add' } | { mode: 'edit'; status: TaskStatus } | { mode: 'delete'; status: TaskStatus }
const statusDialog = ref<StatusDialog | null>(null)
const currentBoard = computed(() => boards.value.find((board) => board.id === current.value))
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
const VIEW_NAMES = { board: 'Board', list: 'Lista', programs: 'Programas', focus: 'Foco' } as const

/**
 * The panel belongs to the board and the list: Programas and Foco cross boards, and it would go stale over them.
 * Back from them, the programs and the focus are read again, since what was written there cuts the board.
 */
function pickView(next: TasksView): void {
  const away = next === 'programs' || next === 'focus'
  if (away) close()
  else if (view.value === 'programs' || view.value === 'focus') {
    void loadPrograms()
    void loadFocus()
  }
  choose(next)
}
/**
 * The panel's width lives with the page, not with the panel (card #44): the
 * panel is remounted for every task, and without storage (C5) the width must
 * still hold until the reload, not until the panel closes.
 */
const panelWidth = usePanelWidth()
/** The task whose panel is open (card #22). */
const opened = ref<number | null>(null)

const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

async function readBoards(): Promise<void> {
  boards.value = await props.deps.tasks.boards()
  if (!boards.value.some((board) => board.id === current.value)) current.value = lastBoard.pick(boards.value)
}

/**
 * Each read takes a ticket, and only the latest one writes the screen: a slow
 * read of the board left behind must not land over the board switched to.
 */
let ticket = 0

/** A failed read of the labels leaves the chips out; the board still shows (RN7 rereads them). */
/** As with the board, only the latest labels read writes them: a late one would bring back an old list. */
let labelsTicket = 0

async function loadLabels(): Promise<void> {
  const mine = (labelsTicket += 1)
  try {
    const read = await props.deps.labels.list()
    if (mine !== labelsTicket) return
    labels.value = read
    labelsRead.value = true
    // A label deleted elsewhere leaves the filter too: one with no chip would hide tasks for nothing.
    filterLabels.value = filterLabels.value.filter((id) => read.some((label) => label.id === id))
  } catch {
    // the next write reads them again
    if (mine === labelsTicket) labelsRead.value = false
  }
}

/**
 * The label a name asks for (card #46): the existing one whatever its case
 * (C5), or a new one with the next palette color (C2), as the Daily Log does.
 */
async function chooseLabel(name: string): Promise<string | null> {
  const normalized = normalizeLabelName(name)
  if (normalized === null) return null
  const existing = findByName(labels.value, normalized)
  if (existing) return existing.id
  try {
    return (await props.deps.labels.create({ name: normalized, color: nextColor(labels.value) })).id
  } finally {
    await loadLabels()
  }
}

/**
 * The programs and the focus behind their filters, read with the board so a
 * write elsewhere reaches them on the next read. Each read stands alone: one
 * that fails says so in place of its chips and turns its filter off, since a
 * cut over nothing read would hide tasks for nothing; the board still shows.
 */
const programs = ref<readonly ProgramWithTasks[]>([])
const programsError = ref<string | null>(null)
const focus = ref<FocusBoard>({ P0: [], P1: [], P2: [] })
const focusError = ref<string | null>(null)
let programsTicket = 0
let focusTicket = 0

async function loadPrograms(): Promise<void> {
  const mine = (programsTicket += 1)
  try {
    const read = await props.deps.programs.programs()
    if (mine !== programsTicket) return
    programs.value = read
    programsError.value = null
    // A program gone elsewhere leaves the filter, as a deleted label does.
    filterPrograms.value = filterPrograms.value.filter((id) => read.some((program) => program.id === id))
  } catch (cause) {
    if (mine !== programsTicket) return
    programsError.value = `não consegui ler os programas: ${message(cause, 'erro desconhecido')}`
    filterPrograms.value = []
  }
}

async function loadFocus(): Promise<void> {
  const mine = (focusTicket += 1)
  try {
    const read = await props.deps.programs.focus()
    if (mine !== focusTicket) return
    focus.value = read
    focusError.value = null
  } catch (cause) {
    if (mine !== focusTicket) return
    focusError.value = `não consegui ler o foco: ${message(cause, 'erro desconhecido')}`
    filterLevels.value = []
  }
}

async function load(): Promise<void> {
  void loadLabels()
  void loadPrograms()
  void loadFocus()
  const mine = (ticket += 1)
  let next: Read
  try {
    if (current.value === null) await readBoards()
    let board = current.value === null ? null : await props.deps.tasks.board(current.value)
    if (!board && mine === ticket) {
      // The board went away between two reads: fall back to the first one.
      await readBoards()
      board = current.value === null ? null : await props.deps.tasks.board(current.value)
    }
    if (!board) throw new Error('board não encontrado')
    next = { state: 'ready', board }
  } catch (cause) {
    next = { state: 'failed', message: message(cause, 'não consegui ler as tarefas') }
  }
  if (mine === ticket) read.value = next
}

/**
 * A task the search asked to open (card #47, C7): its board comes on the
 * screen and its panel opens. Taken on mount, when the search navigated here,
 * and on each request while the screen is already here.
 */
async function openRequested(): Promise<void> {
  const request = takeOpen()
  if (!request) return
  await showTask(request.boardId, request.prefix, request.key)
}

/**
 * Bring a task's board on the screen and open its panel: the search's request
 * (card #47) and a task picked in Programas (LAB-9). The boards are read again
 * when the board is another, since it may be new; the panel opens only when the
 * board read has that task, by prefix and number.
 */
async function showTask(boardId: string, prefix: string, key: number): Promise<void> {
  // The panel belongs to the board and the list, never over Programas or Foco.
  if (view.value === 'programs' || view.value === 'focus') choose('board')
  if (boardId !== current.value) {
    try {
      await readBoards()
    } catch (cause) {
      // Said on the screen, as a failed read is: the request is not lost in silence.
      read.value = { state: 'failed', message: message(cause, 'não consegui ler os boards') }
      return
    }
    if (boards.value.some((board) => board.id === boardId)) {
      current.value = boardId
      lastBoard.remember(boardId)
      composing.value = null
      moveError.value = null
      close()
    }
  }
  await load()
  if (read.value.state === 'ready' && read.value.board.tasks.some((task) => task.key === key && task.keyPrefix === prefix)) {
    open(key)
  }
}

const stopListening = onOpenRequest(() => void openRequested())
onBeforeUnmount(stopListening)

/** A task the quick create made (card #48): the board on the screen takes it when it is its own, and reads again. */
const stopCreated = onTaskCreated((task) => {
  if (task.boardId !== current.value) return false
  void load()
  return true
})
onBeforeUnmount(stopCreated)

onMounted(async () => {
  await load()
  await openRequested()
})

async function switchBoard(boardId: string): Promise<void> {
  if (boardId === current.value) return
  current.value = boardId
  lastBoard.remember(boardId)
  composing.value = null
  moveError.value = null
  close()
  await load()
}

/** Throws on refusal, so the form keeps what was typed and shows why (C2, C3). */
async function createBoard(input: { name: string; prefix: string }): Promise<void> {
  const created = await props.deps.tasks.createBoard(input)
  await readBoards()
  // Closed only after the reread, so a failed read still has the form to say so.
  editing.value = null
  await switchBoard(created.id)
}

async function updateBoard(input: { name: string; prefix: string }): Promise<void> {
  if (current.value === null) return
  const updated = await props.deps.tasks.updateBoard(current.value, input)
  if (!updated) throw new Error('board não encontrado')
  await readBoards()
  editing.value = null
}

async function addStatus(input: { name: string; category: StatusCategory; color: StatusColor }): Promise<void> {
  if (current.value === null) return
  const added = await props.deps.tasks.addStatus(current.value, input)
  if (!added) throw new Error('board não encontrado')
  statusDialog.value = null
  await load()
}

async function updateStatus(id: string, input: { name: string; color: StatusColor }): Promise<void> {
  const updated = await props.deps.tasks.updateStatus(id, { name: input.name, color: input.color })
  if (!updated) throw new Error('status não encontrado')
  statusDialog.value = null
  await load()
}

/** Throws on a refusal, so the dialog says why; the board is reread either way (RN7). */
async function deleteStatus(id: string, moveTo: string | undefined): Promise<void> {
  try {
    await props.deps.tasks.deleteStatus(id, moveTo)
    statusDialog.value = null
  } finally {
    await load()
  }
}

const tasksIn = (statusId: string) =>
  read.value.state === 'ready' ? read.value.board.tasks.filter((task) => task.statusId === statusId).length : 0
const otherStatuses = (statusId: string) =>
  read.value.state === 'ready' ? read.value.board.statuses.filter((status) => status.id !== statusId) : []

/** The whole key of a task on the screen: its frozen prefix and its number (RN5). */
function keyOf(key: number): TaskKey | null {
  if (read.value.state !== 'ready') return null
  const task = read.value.board.tasks.find((candidate) => candidate.key === key) ?? lastOpened.value
  return task && task.key === key ? { prefix: task.keyPrefix, key } : null
}

/**
 * The labels toggled on above the board: they cut the board and the list
 * alike (OR between them), outlive a board switch, since a label is global
 * (RN13), and live only while the screen does, like the Daily Log's filter.
 */
const filterLabels = ref<string[]>([])

function toggleFilterLabel(id: string): void {
  filterLabels.value = filterLabels.value.includes(id)
    ? filterLabels.value.filter((x) => x !== id)
    : [...filterLabels.value, id]
}

/** The programs and the focus levels toggled on: like the labels, OR inside each, AND between them. */
const filterPrograms = ref<string[]>([])
const filterLevels = ref<FocusLevel[]>([])
const LEVEL_OPTIONS = FOCUS_LEVELS.map((level) => ({ id: level, name: level }))

const toggled = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

function toggleFilterLevel(id: string): void {
  const level = FOCUS_LEVELS.find((candidate) => candidate === id)
  if (level) filterLevels.value = toggled(filterLevels.value, level)
}

const filtering = computed(
  () => filterLabels.value.length > 0 || filterPrograms.value.length > 0 || filterLevels.value.length > 0,
)

function clearFilters(): void {
  filterLabels.value = []
  filterPrograms.value = []
  filterLevels.value = []
}

const shown = computed(() => {
  if (read.value.state !== 'ready') return null
  const byLabels = filterByLabels(read.value.board, filterLabels.value)
  const byPrograms = filterByPrograms(byLabels, programs.value, filterPrograms.value)
  return filterByFocus(byPrograms, programs.value, focus.value, filterLevels.value)
})
const groups = computed(() => (shown.value ? groupByStatus(shown.value) : []))
/** A board with tasks the filter hides all of: said as such, never as an empty board. */
const filteredOut = computed(
  () => read.value.state === 'ready' && read.value.board.tasks.length > 0 && shown.value?.tasks.length === 0,
)
/**
 * An empty board shows the invitation (#20 C2) above its columns, not in
 * their place: since #43 the columns are where the statuses are managed, and
 * a new board opens in them (#42 C1).
 */
const empty = computed(
  () => read.value.state === 'ready' && read.value.board.tasks.length === 0 && composing.value === null,
)

function inviteFirst(): void {
  if (read.value.state !== 'ready') return
  composing.value = firstToDo(read.value.board)?.id ?? null
}

/** Throws on refusal, so the form keeps what was typed and shows why (C6 of #20). */
async function create(statusId: string, title: string): Promise<void> {
  if (current.value === null) throw new Error('board não encontrado')
  // Inside a filter, the task is born with its labels, or it would vanish as it is created.
  const labelIds = filterLabels.value.length > 0 ? { labelIds: filterLabels.value } : {}
  await props.deps.tasks.create({ boardId: current.value, title, statusId, ...labelIds })
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
  void loadProgramLine()
}

/** The open task's program, as the panel shows it (LAB-9); nothing when it has none or it cannot be read. */
const programLine = ref<string | null>(null)
async function loadProgramLine(): Promise<void> {
  programLine.value = null
  const task = panelTask.value
  if (!task) return
  try {
    const found = await props.deps.programs.programOf({ prefix: task.keyPrefix, key: task.key })
    const program = found?.program
    if (program && panelTask.value === task) {
      programLine.value = program.focus ? `foco ${program.focus} · ${program.name}` : program.name
    }
  } catch {
    // Sem a leitura do programa, o painel abre sem a linha dele.
  }
}

/** A task picked in the Programas view (LAB-9): its board in the board view, and its panel. */
async function openFromProgram(task: { key: string; boardId: string }): Promise<void> {
  const parsed = parseKey(task.key)
  if (!parsed) return
  await showTask(task.boardId, parsed.prefix, parsed.key)
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
  const whole = keyOf(key)
  if (!whole) return false
  try {
    const saved = await props.deps.tasks.update(whole, {
      title: draft.title,
      priority: draft.priority,
      body: draft.body,
      ...(draft.labelIds !== undefined ? { labelIds: draft.labelIds } : {}),
      ...(current && current.statusId !== draft.statusId
        ? { placement: placeAt(board, key, draft.statusId, top) }
        : {}),
    })
    return saved !== null
  } finally {
    await load()
  }
}

/**
 * The panel's door to the comments of one task (card #45). The whole key is
 * taken from the task the panel opened with, so a comment is sent to that
 * task even after the board is reread.
 */
function commentsOf(task: Task) {
  const whole: TaskKey = { prefix: task.keyPrefix, key: task.key }
  return {
    list: () => props.deps.tasks.comments(whole),
    add: (body: string) => props.deps.tasks.addComment(whole, body),
    remove: (id: string) => props.deps.tasks.deleteComment(whole, id),
  }
}

async function remove(key: number): Promise<void> {
  const whole = keyOf(key)
  if (whole) await props.deps.tasks.delete(whole)
  close()
  await load()
}

async function drop(statusId: string, beforeKey: number | null): Promise<void> {
  const key = grabbed.value
  grabbed.value = null
  if (key === null || key === beforeKey || read.value.state !== 'ready') return
  const whole = keyOf(key)
  if (!whole) return
  moveError.value = null
  try {
    const moved = await props.deps.tasks.update(whole, {
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
  <div class="relative flex h-full min-h-0 flex-col" data-testid="tasks">
    <nav class="flex items-center gap-2 px-6 py-4 text-sm text-[#747e8f]">
      <span>Tasks</span>
      <span class="text-[#1e2638]">/</span>
      <select
        v-if="boards.length > 0"
        aria-label="Board"
        :value="current ?? undefined"
        class="rounded-md border border-[#1e2638] bg-transparent px-1.5 py-0.5 text-sm text-gray-200 outline-none focus:border-[#3b82f6]"
        @change="switchBoard(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="board in boards" :key="board.id" :value="board.id" class="bg-[#0b101b]">{{ board.name }}</option>
      </select>
      <button
        v-if="currentBoard"
        type="button"
        aria-label="Editar board"
        :title="`Editar ${currentBoard.name} (prefixo ${currentBoard.prefix})`"
        class="rounded px-1.5 text-xs text-[#747e8f] hover:bg-[#1e2638] hover:text-gray-100"
        @click="editing = 'edit'"
      >
        {{ currentBoard.prefix }}
      </button>
      <button
        v-if="read.state === 'ready'"
        type="button"
        aria-label="Adicionar status"
        title="Adicionar status"
        class="rounded px-1.5 text-xs text-[#747e8f] hover:bg-[#1e2638] hover:text-gray-100"
        @click="statusDialog = { mode: 'add' }"
      >
        <span aria-hidden="true">+ </span>Adicionar status
      </button>
      <button
        v-if="boards.length > 0"
        type="button"
        aria-label="Novo board"
        title="Novo board"
        class="rounded px-1.5 text-[#747e8f] hover:bg-[#1e2638] hover:text-gray-100"
        @click="editing = 'create'"
      >
        +
      </button>
      <span class="text-[#1e2638]">/</span>
      <span class="text-gray-300">{{ VIEW_NAMES[view] }}</span>
      <div class="ml-auto flex rounded-md border border-[#1e2638] p-0.5" role="group" aria-label="Visualização">
        <button
          v-for="option in (['board', 'list', 'programs', 'focus'] as const)"
          :key="option"
          type="button"
          :aria-pressed="view === option ? 'true' : 'false'"
          class="rounded px-2 py-0.5 text-xs"
          :class="view === option ? 'bg-white/10 text-gray-100' : 'text-[#747e8f] hover:text-gray-200'"
          @click="pickView(option)"
        >
          {{ VIEW_NAMES[option] }}
        </button>
      </div>
    </nav>

    <BoardForm
      v-if="editing === 'create'"
      title="Novo board"
      submit-label="Criar board"
      :save="createBoard"
      @cancel="editing = null"
    />
    <BoardForm
      v-else-if="editing === 'edit' && currentBoard"
      :key="currentBoard.id"
      title="Editar board"
      submit-label="Salvar"
      :initial="{ name: currentBoard.name, prefix: currentBoard.prefix }"
      :save="updateBoard"
      @cancel="editing = null"
    />

    <StatusForm v-if="statusDialog?.mode === 'add'" :save="addStatus" @cancel="statusDialog = null" />
    <StatusForm
      v-else-if="statusDialog?.mode === 'edit'"
      :key="statusDialog.status.id"
      :editing="statusDialog.status"
      :save="(input) => updateStatus((statusDialog as { status: TaskStatus }).status.id, input)"
      @cancel="statusDialog = null"
    />
    <StatusDelete
      v-else-if="statusDialog?.mode === 'delete'"
      :key="statusDialog.status.id"
      :status="statusDialog.status"
      :others="otherStatuses(statusDialog.status.id)"
      :task-count="tasksIn(statusDialog.status.id)"
      :remove="(moveTo) => deleteStatus((statusDialog as { status: TaskStatus }).status.id, moveTo)"
      @cancel="statusDialog = null"
    />

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <ProgramsView v-if="view === 'programs'" :programs="deps.programs" @open="openFromProgram" />
      <FocusView v-else-if="view === 'focus'" :programs="deps.programs" />
      <p v-else-if="read.state === 'loading'" class="text-sm text-[#747e8f]">Carregando as tarefas…</p>

      <p
        v-else-if="read.state === 'failed'"
        role="alert"
        class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
      >
        {{ read.message }}
      </p>

      <template v-else>
        <div v-if="empty" class="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-[#1e2638] px-4 py-3">
          <p class="text-sm text-gray-300">Nenhuma tarefa ainda</p>
          <button
            type="button"
            class="rounded-md bg-[#3b82f6] px-3 py-1.5 text-sm font-medium text-white"
            @click="inviteFirst"
          >
            Criar a primeira tarefa
          </button>
        </div>

        <div class="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <LabelFilter v-if="labels.length > 0" :labels="labels" :label-ids="filterLabels" @toggle="toggleFilterLabel" />
          <ScopeFilter
            label="Filtrar por programa"
            :options="programs"
            :selected="filterPrograms"
            :error="programsError"
            @toggle="filterPrograms = toggled(filterPrograms, $event)"
          />
          <ScopeFilter
            label="Filtrar por foco"
            :options="LEVEL_OPTIONS"
            :selected="filterLevels"
            :error="focusError"
            @toggle="toggleFilterLevel"
          />
          <button
            v-if="filtering"
            type="button"
            class="text-[#747e8f] underline hover:text-gray-200"
            @click="clearFilters"
          >
            Limpar filtro
          </button>
        </div>

        <p v-if="filteredOut" class="mb-4 text-sm text-[#747e8f]">nenhuma tarefa com esse filtro</p>

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
            :labels="labels"
            @compose="composing = $event"
            @cancel="composing = null"
            @grab="grabbed = $event"
            @release="grabbed = null"
            @open="open"
            @drop="drop"
            @edit-status="statusDialog = { mode: 'edit', status: $event }"
            @remove-status="statusDialog = { mode: 'delete', status: $event }"
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
            :labels="labels"
            @compose="composing = $event"
            @cancel="composing = null"
            @open="open"
            @edit-status="statusDialog = { mode: 'edit', status: $event }"
            @remove-status="statusDialog = { mode: 'delete', status: $event }"
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
        :comments="commentsOf(panelTask)"
        :labels="labels"
        :labels-read="labelsRead"
        :choose-label="chooseLabel"
        :program="programLine"
        :zone="deps.zone"
        @resize="panelWidth.follow"
        @resized="panelWidth.settle"
        @close="close"
      />
    </div>
  </div>
</template>
