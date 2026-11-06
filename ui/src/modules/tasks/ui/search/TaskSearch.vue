<script setup lang="ts">
import { formatKey, type TaskSearchResult } from '@dailly/tasks-core'
import type { SharedDeps } from '@shared'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TasksDeps } from '../../deps.js'
import { requestOpen } from '../../model/open-request.js'
import { useLastBoard } from '../board-choice.js'

/**
 * The search of tasks, opened by the shell from Ctrl+K on any screen (card
 * #47, J10): by key or part of the title, in every board.
 *
 * It asks the API only after a pause in the typing, never for an empty text,
 * and drops the answer to a text that has already changed. Choosing a task
 * makes its board the last used (F4) and leaves the request to open it for the
 * Tasks screen, then goes there and closes.
 */
// The shape of `CommandProps` (`@shared`), written out: the SFC compiler
// does not resolve an imported generic in `defineProps`.
const props = defineProps<{
  deps: SharedDeps & TasksDeps
  focusTick: number
  navigate: (route: string) => void
  close: () => void
}>()

const PAUSE_MS = 150

const text = ref('')
const results = ref<readonly TaskSearchResult[]>([])
const searched = ref('')
const error = ref<string | null>(null)
const active = ref(0)
const field = ref<HTMLInputElement | null>(null)
const lastBoard = useLastBoard()

let timer: ReturnType<typeof setTimeout> | undefined

onMounted(() => field.value?.focus())
onBeforeUnmount(() => clearTimeout(timer))
watch(
  () => props.focusTick,
  () => field.value?.focus(),
)

async function run(query: string): Promise<void> {
  try {
    const found = await props.deps.tasks.search(query)
    if (query !== text.value) return
    results.value = found
    searched.value = query
    active.value = 0
    error.value = null
  } catch (cause) {
    if (query !== text.value) return
    error.value = cause instanceof Error ? cause.message : 'não consegui buscar as tarefas'
  }
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value
  clearTimeout(timer)
  if (text.value.trim() === '') {
    results.value = []
    searched.value = ''
    error.value = null
    return
  }
  const query = text.value
  timer = setTimeout(() => void run(query), PAUSE_MS)
}

function choose(result: TaskSearchResult): void {
  lastBoard.remember(result.boardId)
  requestOpen({ boardId: result.boardId, prefix: result.keyPrefix, key: result.key })
  props.navigate('/tasks')
  props.close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    props.close()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = results.value.length
    if (count > 0) active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const picked = results.value[active.value]
    if (picked) choose(picked)
  }
}

const optionId = (index: number) => `task-search-option-${index}`
</script>

<template>
  <div
    role="dialog"
    aria-label="Buscar tarefa"
    aria-modal="true"
    class="w-[36rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#1e2638] bg-[#0b101b] shadow-2xl"
  >
    <input
      ref="field"
      :value="text"
      type="text"
      role="combobox"
      aria-label="Buscar tarefa"
      aria-controls="task-search-results"
      :aria-expanded="results.length > 0 ? 'true' : 'false'"
      :aria-activedescendant="results.length > 0 ? optionId(active) : undefined"
      placeholder="Buscar pela chave ou pelo título"
      class="w-full border-b border-[#1e2638] bg-transparent px-4 py-3 text-sm text-gray-100 outline-none"
      @input="onInput"
      @keydown="onKeydown"
    />
    <p v-if="error" role="alert" class="px-4 py-3 text-sm text-red-300">{{ error }}</p>
    <ul v-else-if="results.length > 0" id="task-search-results" role="listbox" class="max-h-80 overflow-y-auto py-1">
      <li
        v-for="(result, index) in results"
        :id="optionId(index)"
        :key="`${result.keyPrefix}-${result.key}`"
        role="option"
        :aria-selected="index === active ? 'true' : 'false'"
        class="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm"
        :class="index === active ? 'bg-white/10 text-gray-100' : 'text-gray-300'"
        @mouseenter="active = index"
        @click="choose(result)"
      >
        <span class="w-16 shrink-0 font-mono text-xs text-[#747e8f]">{{ formatKey(result.keyPrefix, result.key) }}</span>
        <span class="min-w-0 flex-1 truncate">{{ result.title }}</span>
        <span class="shrink-0 text-xs text-[#747e8f]">{{ result.boardName }}</span>
      </li>
    </ul>
    <p v-else-if="searched !== '' && searched === text" class="px-4 py-3 text-sm text-[#747e8f]">
      nenhuma tarefa encontrada
    </p>
  </div>
</template>
