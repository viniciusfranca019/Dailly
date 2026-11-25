<script setup lang="ts">
import { FOCUS_LEVELS } from '@dailly/tasks-core'
import type { FocusBoard, FocusItem, FocusLevel, ProgramsPort } from '@shared'
import { onMounted, ref } from 'vue'

/**
 * The Foco view (LAB-9): P0, P1 and P2, each with what is in it, in the order
 * it came in. A task with no program goes in by its key; a program's level is
 * set in the Programas view. A task of a program is refused here (C6).
 */
const props = defineProps<{ programs: ProgramsPort }>()

const board = ref<FocusBoard>({ P0: [], P1: [], P2: [] })
const failed = ref<string | null>(null)
const key = ref('')
const level = ref<FocusLevel>('P0')
const refusal = ref<string | null>(null)

const reason = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)
const nameOf = (item: FocusItem) => (item.kind === 'program' ? item.name : item.key)

async function load(): Promise<void> {
  try {
    board.value = await props.programs.focus()
    failed.value = null
  } catch (cause) {
    failed.value = reason(cause, 'não consegui ler o foco')
  }
}
onMounted(load)

async function put(): Promise<void> {
  if (key.value.trim() === '') return
  try {
    const found = await props.programs.setFocus({ task: key.value.trim() }, level.value)
    refusal.value = found ? null : 'tarefa não encontrada'
    if (found) key.value = ''
  } catch (cause) {
    refusal.value = reason(cause, 'não consegui pôr em foco')
  }
  await load()
}

async function takeOut(item: FocusItem): Promise<void> {
  try {
    await props.programs.setFocus(item.kind === 'program' ? { program: item.id } : { task: item.key }, null)
  } catch (cause) {
    failed.value = reason(cause, 'não consegui tirar do foco')
  }
  await load()
}
</script>

<template>
  <section aria-label="Foco" class="flex flex-col gap-4">
    <p v-if="failed" role="alert" class="text-sm text-red-300">{{ failed }}</p>

    <section
      v-for="name in FOCUS_LEVELS"
      :key="name"
      :aria-label="`Foco ${name}`"
      class="flex flex-col gap-1 rounded-lg border border-[#1e2638] p-3"
    >
      <h2 class="text-xs font-medium text-gray-100">{{ name }} <span class="text-[#747e8f]">{{ board[name].length }}</span></h2>
      <p v-if="board[name].length === 0" class="text-xs text-[#747e8f]">nada aqui</p>
      <ul v-else class="flex flex-col gap-1 text-sm">
        <li v-for="item in board[name]" :key="item.kind === 'program' ? item.id : item.key" class="flex items-center gap-2">
          <span data-focus-item class="text-gray-200">
            <template v-if="item.kind === 'program'">{{ item.name }}</template>
            <template v-else><span class="font-mono text-xs">{{ item.key }}</span> {{ item.title }}</template>
          </span>
          <button
            type="button"
            :aria-label="`Tirar ${nameOf(item)} do foco`"
            class="ml-auto text-xs text-[#747e8f] hover:text-gray-200"
            @click="takeOut(item)"
          >
            Tirar do foco
          </button>
        </li>
      </ul>
    </section>

    <form aria-label="Pôr tarefa em foco" class="flex flex-wrap items-center gap-2" @submit.prevent="put">
      <input
        v-model="key"
        aria-label="Chave da tarefa"
        placeholder="LAB-8"
        class="w-28 rounded-md border border-[#1e2638] bg-transparent px-2 py-0.5 text-xs text-gray-200 outline-none focus:border-[#3b82f6]"
      />
      <select
        v-model="level"
        aria-label="Nível"
        class="rounded-md border border-[#1e2638] bg-transparent px-1 py-0.5 text-xs text-gray-200"
      >
        <option v-for="name in FOCUS_LEVELS" :key="name" :value="name" class="bg-[#0b101b]">{{ name }}</option>
      </select>
      <button type="submit" class="text-xs text-[#747e8f] hover:text-gray-200">Pôr em foco</button>
      <p v-if="refusal" role="alert" class="w-full text-xs text-red-300">{{ refusal }}</p>
    </form>
  </section>
</template>
