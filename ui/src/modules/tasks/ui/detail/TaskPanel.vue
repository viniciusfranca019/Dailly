<script setup lang="ts">
import { LabelPicker } from '@capabilities/labels'
import type { TimeZone } from '@dailly/periods'
import type { Label } from '@shared'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
import {
  PRIORITY_LABELS,
  TitleRequiredError,
  formatKey,
  normalizeTitle,
  type Priority,
  type Task,
  type TaskStatus,
} from '@dailly/tasks-core'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Draft } from '../../model/draft.js'
import { PANEL_WIDTH } from '../../model/width.js'
import TaskComments, { type CommentsAccess } from './TaskComments.vue'

/**
 * The panel of one task (card #22): title, status, priority and the body in
 * the block editor, saved with Ctrl+S or the button.
 *
 * The form is the panel's own draft, seeded once from the task it opened
 * with, so a reread of the board after a save does not overwrite what is
 * being typed. Saving is explicit; closing drops an unsaved draft (the card's
 * Fora de escopo). The whiteboard is an island, as in the Daily Log composer.
 */

const props = defineProps<{
  task: Task
  statuses: readonly TaskStatus[]
  /** Resolves `false` when the task no longer exists; throws on a refusal. */
  save: (draft: Draft) => Promise<boolean>
  remove: () => Promise<void>
  /** In pixels, already inside the limits (card #44). */
  width: number
  /** The task's comments (card #45), read in a GET of their own. */
  comments: CommentsAccess
  zone: TimeZone
  /** The global labels (card #46). */
  labels: readonly Label[]
  /** The id of the label with that name, the existing one or a new one; `null` for an empty name. */
  chooseLabel: (name: string) => Promise<string | null>
}>()
const emit = defineEmits<{
  close: []
  /** The width the pointer asks for while the edge is dragged; the page clamps it. */
  resize: [requested: number]
  /** The edge was released: the width can be remembered. */
  resized: []
}>()

const title = ref(props.task.title)
const statusId = ref(props.task.statusId)
const priority = ref<Priority>(props.task.priority)
/** In the draft, saved with the rest by Salvar or Ctrl+S, never one PATCH per click (card #46). */
const labelIds = ref<readonly string[]>(props.task.labelIds)
const error = ref<string | null>(null)
const gone = ref(false)
const confirming = ref(false)
const busy = ref(false)

const boardHost = ref<HTMLElement | null>(null)
const doc = shallowRef<WhiteboardDocument | null>(null)
const board = shallowRef<WhiteboardHandle | null>(null)

const titleField = ref<HTMLInputElement | null>(null)

/**
 * The shortcuts listen on `window`, as the Daily Log composer's do: the panel
 * opens from a click, and wherever focus is while it is open, Ctrl+S must save
 * rather than open the browser's "save page".
 */
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  titleField.value?.focus()
  if (!boardHost.value) return
  doc.value = new WhiteboardDocument(props.task.body)
  board.value = mountWhiteboard(boardHost.value, doc.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  board.value?.destroy()
})

const PRIORITIES = [0, 1, 2, 3, 4] as const

async function submit(): Promise<void> {
  if (busy.value || gone.value) return
  let normalized: string
  try {
    normalized = normalizeTitle(title.value)
  } catch (cause) {
    if (cause instanceof TitleRequiredError) {
      error.value = cause.message
      return
    }
    throw cause
  }
  busy.value = true
  error.value = null
  try {
    const found = await props.save({
      title: normalized,
      statusId: statusId.value,
      priority: priority.value,
      body: doc.value?.toMarkdown() ?? props.task.body,
      labelIds: labelIds.value,
    })
    if (!found) gone.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui salvar a tarefa'
  } finally {
    busy.value = false
  }
}

async function addLabel(name: string): Promise<void> {
  try {
    const id = await props.chooseLabel(name)
    if (id !== null && !labelIds.value.includes(id)) labelIds.value = [...labelIds.value, id]
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui criar a label'
  }
}

function dropLabel(id: string): void {
  labelIds.value = labelIds.value.filter((chosen) => chosen !== id)
}

async function confirmRemove(): Promise<void> {
  busy.value = true
  try {
    await props.remove()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui apagar a tarefa'
    confirming.value = false
  } finally {
    busy.value = false
  }
}

const root = ref<HTMLElement | null>(null)

/**
 * The left edge drag (card #44), with Pointer Events and no library: the
 * capture keeps the moves coming while the pointer leaves the thin handle.
 * The panel is anchored on the right, so moving left widens it.
 */
const dragging = ref<{ startX: number; startWidth: number } | null>(null)

function startResize(event: PointerEvent): void {
  // From the width on screen, not the stored one: in a window narrower than
  // the stored width (C4) the panel is capped, and a drag from the stored
  // value would stand still at first and then store a width never seen.
  const rendered = root.value?.getBoundingClientRect().width ?? 0
  dragging.value = { startX: event.clientX, startWidth: rendered > 0 ? rendered : props.width }
  const handle = event.currentTarget
  if (handle instanceof HTMLElement && 'pointerId' in event) handle.setPointerCapture?.(event.pointerId)
}

function moveResize(event: PointerEvent): void {
  if (!dragging.value) return
  emit('resize', dragging.value.startWidth + (dragging.value.startX - event.clientX))
}

function endResize(): void {
  if (!dragging.value) return
  dragging.value = null
  emit('resized')
}

/**
 * Whether an Escape is the panel's to act on. Every other control keeps its
 * own: the block editor clears a selection with it, the capture under a "+"
 * cancels with it. So the panel closes only on an Escape that comes from
 * inside itself, outside the editor, or from nowhere in particular (focus on
 * the page body), which no one else handles.
 */
function escapeIsMine(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Node) || target === document.body || target === document.documentElement) return true
  if (boardHost.value?.contains(target)) return false
  // The comment editor is a block editor too, with its own Escape.
  if (target instanceof Element && target.closest('[data-editor]')) return false
  return root.value?.contains(target) ?? false
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void submit()
  } else if (event.key === 'Escape' && !event.defaultPrevented && !confirming.value && escapeIsMine(event)) {
    // An Esc someone already took (the search over the panel closed with it) is not the panel's.
    emit('close')
  }
}
</script>

<template>
  <aside
    ref="root"
    role="dialog"
    :aria-label="formatKey(task.keyPrefix, task.key)"
    :style="{ width: `${width}px`, maxWidth: '100%' }"
    class="fixed inset-y-0 right-0 z-20 border-l border-[#1e2638] bg-[#0b1019] shadow-2xl"
  >
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar o painel"
      :aria-valuenow="width"
      :aria-valuemin="PANEL_WIDTH.min"
      :aria-valuemax="PANEL_WIDTH.max"
      class="absolute inset-y-0 left-0 w-1.5 cursor-col-resize touch-none hover:bg-[#3b82f6]/40"
      :class="{ 'bg-[#3b82f6]/40': dragging }"
      @pointerdown.prevent="startResize"
      @pointermove="moveResize"
      @pointerup="endResize"
      @pointercancel="endResize"
    />
    <!-- The content scrolls inside; the edge stays put on the panel's border. -->
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header class="flex items-center gap-2">
        <span class="font-mono text-xs text-[#747e8f]">{{ formatKey(task.keyPrefix, task.key) }}</span>
        <button type="button" class="ml-auto text-sm text-[#747e8f] hover:text-gray-100" @click="emit('close')">
          Fechar
        </button>
      </header>

      <div v-if="gone" class="flex flex-col items-start gap-3">
        <p role="alert" class="text-sm text-red-300">tarefa não encontrada</p>
        <button type="button" class="text-sm text-[#3b82f6] hover:underline" @click="emit('close')">
          Voltar ao board
        </button>
      </div>

      <template v-else>
        <input
          ref="titleField"
          v-model="title"
          type="text"
          aria-label="Título"
          :aria-invalid="error ? 'true' : undefined"
          class="rounded-md border border-transparent bg-transparent px-1 text-lg font-medium text-gray-100 outline-none focus:border-[#1e2638]"
        />

        <div class="flex gap-4 text-sm">
          <label class="flex items-center gap-2 text-[#747e8f]">
            <span>Status</span>
            <select
              v-model="statusId"
              aria-label="Status"
              class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-gray-100"
            >
              <option v-for="status in statuses" :key="status.id" :value="status.id">{{ status.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-[#747e8f]">
            <span>Prioridade</span>
            <select
              v-model.number="priority"
              aria-label="Prioridade"
              class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-gray-100"
            >
              <option v-for="level in PRIORITIES" :key="level" :value="level">{{ PRIORITY_LABELS[level] }}</option>
            </select>
          </label>
        </div>

        <LabelPicker
          :labels="labels"
          :chosen="labelIds"
          :list-id="`task-labels-${task.id}`"
          @add="addLabel"
          @remove="dropLabel"
        />

        <div ref="boardHost" class="min-h-40 rounded-md border border-[#1e2638] p-3" data-testid="task-body" />

        <p v-if="error" role="alert" class="text-sm text-red-300">{{ error }}</p>

        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="busy"
            class="rounded-md bg-[#3b82f6] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            @click="submit"
          >
            Salvar
          </button>
          <span class="text-xs text-[#747e8f]">Ctrl+S</span>
          <button
            type="button"
            class="ml-auto rounded-md px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
            @click="confirming = true"
          >
            Apagar
          </button>
        </div>

        <div
          v-if="confirming"
          role="alertdialog"
          :aria-label="`Apagar ${formatKey(task.keyPrefix, task.key)}?`"
          class="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm"
        >
          <p class="text-gray-200">Apagar {{ formatKey(task.keyPrefix, task.key) }}? Não dá para desfazer.</p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              :disabled="busy"
              class="rounded-md bg-red-500 px-3 py-1 text-white disabled:opacity-50"
              @click="confirmRemove"
            >
              Apagar
            </button>
            <button type="button" class="px-3 py-1 text-gray-300" @click="confirming = false">Cancelar</button>
          </div>
        </div>

        <TaskComments :access="comments" :zone="zone" @gone="gone = true" />
      </template>
    </div>
  </aside>
</template>
