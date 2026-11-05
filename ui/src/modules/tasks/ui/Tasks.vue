<script setup lang="ts">
import type { SharedDeps, TaskBoard } from '@shared'
import { computed, onMounted, ref } from 'vue'
import type { TasksDeps } from '../deps.js'
import { firstToDo, groupByStatus } from '../model/list.js'
import StatusGroup from './list/StatusGroup.vue'

/**
 * Tasks, F1: the list grouped by status and the capture under each "+".
 *
 * After a create the screen reads the board again instead of inserting the
 * task by hand: the server owns the key and the rank, and rereading is what
 * the Requests screen already does (PRD RN7).
 */
const props = defineProps<{ deps: SharedDeps & TasksDeps }>()

type Read = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; board: TaskBoard }

const read = ref<Read>({ state: 'loading' })
/** The status whose capture is open, if any. */
const composing = ref<string | null>(null)

async function load(): Promise<void> {
  try {
    read.value = { state: 'ready', board: await props.deps.tasks.board() }
  } catch (cause) {
    read.value = { state: 'failed', message: cause instanceof Error ? cause.message : 'não consegui ler as tarefas' }
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

/** Throws on refusal, so the form keeps what was typed and shows why (C6). */
async function create(statusId: string, title: string): Promise<void> {
  await props.deps.tasks.create({ title, statusId })
  composing.value = null
  await load()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="tasks">
    <nav class="flex items-center gap-2 px-6 py-4 text-sm text-[#747e8f]">
      <span>Tasks</span>
      <span class="text-[#1e2638]">/</span>
      <span class="text-gray-300">Lista</span>
    </nav>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
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

      <div v-else class="flex flex-col gap-4">
        <StatusGroup
          v-for="group in groups"
          :key="group.status.id"
          :group="group"
          :composing="composing === group.status.id"
          :create="create"
          @compose="composing = $event"
          @cancel="composing = null"
        />
      </div>
    </div>
  </div>
</template>
