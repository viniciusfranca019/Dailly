<script setup lang="ts">
import { FOCUS_LEVELS, InvalidWindowError, NameRequiredError, isFocusLevel, parseNewProgram } from '@dailly/tasks-core'
import type { FocusLevel, ProgramWithTasks, ProgramsPort } from '@shared'
import { onMounted, ref } from 'vue'
import { shownWindow } from './window.js'

/**
 * The Programas view (LAB-9): every program with its tasks, the form of a new
 * one, the program's focus level and a field to bring a task in by its key.
 * The new program is checked here with the core's own parse (C2), so the form
 * refuses before any call and keeps what was typed.
 */
const props = defineProps<{ programs: ProgramsPort }>()
const emit = defineEmits<{ open: [task: { key: string; boardId: string }] }>()

const list = ref<readonly ProgramWithTasks[]>([])
const failed = ref<string | null>(null)
/** Until the first read answers: the empty state would say something false. */
const loading = ref(true)
const creating = ref(false)
const draft = ref({ name: '', objective: '', windowStart: '', windowEnd: '', exitWhen: '' })
const formError = ref<string | null>(null)
const keys = ref<Record<string, string>>({})
const refusals = ref<Record<string, string>>({})

const reason = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

async function load(): Promise<void> {
  try {
    list.value = await props.programs.programs()
    failed.value = null
  } catch (cause) {
    failed.value = reason(cause, 'não consegui ler os programas')
  }
  loading.value = false
}
onMounted(load)

async function create(): Promise<void> {
  let input
  try {
    input = parseNewProgram(draft.value)
  } catch (cause) {
    if (cause instanceof NameRequiredError || cause instanceof InvalidWindowError) {
      formError.value = cause.message
      return
    }
    throw cause
  }
  try {
    await props.programs.createProgram(input)
  } catch (cause) {
    formError.value = reason(cause, 'não consegui criar o programa')
    return
  }
  creating.value = false
  formError.value = null
  draft.value = { name: '', objective: '', windowStart: '', windowEnd: '', exitWhen: '' }
  await load()
}

async function addTask(program: ProgramWithTasks): Promise<void> {
  const key = (keys.value[program.id] ?? '').trim()
  if (key === '') return
  try {
    const updated = await props.programs.addToProgram(program.id, key)
    refusals.value = { ...refusals.value, [program.id]: updated ? '' : 'programa não encontrado' }
    if (updated) keys.value = { ...keys.value, [program.id]: '' }
  } catch (cause) {
    refusals.value = { ...refusals.value, [program.id]: reason(cause, 'não consegui adicionar a tarefa') }
  }
  await load()
}

async function setFocus(program: ProgramWithTasks, value: string): Promise<void> {
  const level: FocusLevel | null = isFocusLevel(value) ? value : null
  try {
    await props.programs.setFocus({ program: program.id }, level)
    refusals.value = { ...refusals.value, [program.id]: '' }
  } catch (cause) {
    refusals.value = { ...refusals.value, [program.id]: reason(cause, 'não consegui mudar o foco') }
  }
  await load()
}

const FIELDS = [
  { key: 'name', label: 'Nome', type: 'text' },
  { key: 'objective', label: 'Objetivo', type: 'text' },
  { key: 'windowStart', label: 'Início da janela', type: 'date' },
  { key: 'windowEnd', label: 'Fim da janela', type: 'date' },
  { key: 'exitWhen', label: 'Sai quando', type: 'text' },
] as const
</script>

<template>
  <section aria-label="Programas" class="flex flex-col gap-4">
    <p v-if="loading" class="text-sm text-[#747e8f]">Carregando os programas…</p>
    <p v-if="failed" role="alert" class="text-sm text-red-300">{{ failed }}</p>

    <div>
      <button
        v-if="!creating"
        type="button"
        class="rounded-md border border-[#1e2638] px-2 py-1 text-xs text-gray-200 hover:bg-[#1e2638]"
        @click="creating = true"
      >
        Novo programa
      </button>
      <form
        v-else
        aria-label="Novo programa"
        class="flex max-w-md flex-col gap-2 rounded-lg border border-[#1e2638] p-3"
        @submit.prevent="create"
      >
        <label v-for="field in FIELDS" :key="field.key" class="flex flex-col gap-1 text-xs text-[#747e8f]">
          {{ field.label }}
          <input
            v-model="draft[field.key]"
            :type="field.type"
            :aria-label="field.label"
            class="rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-sm text-gray-200 outline-none focus:border-[#3b82f6]"
          />
        </label>
        <p v-if="formError" role="alert" class="text-sm text-red-300">{{ formError }}</p>
        <div class="flex gap-2">
          <button type="submit" class="rounded-md bg-[#3b82f6] px-2 py-1 text-xs text-white">Criar</button>
          <button type="button" class="px-2 py-1 text-xs text-[#747e8f]" @click="creating = false; formError = null">
            Cancelar
          </button>
        </div>
      </form>
    </div>

    <p v-if="!loading && list.length === 0 && !failed" class="text-sm text-[#747e8f]">Nenhum programa ainda</p>

    <article
      v-for="program in list"
      :key="program.id"
      :aria-label="`Programa ${program.name}`"
      class="flex flex-col gap-2 rounded-lg border border-[#1e2638] p-3"
    >
      <header class="flex items-center gap-3">
        <h2 class="text-sm font-medium text-gray-100">{{ program.name }}</h2>
        <select
          :aria-label="`Foco de ${program.name}`"
          :value="program.focus ?? ''"
          class="ml-auto rounded-md border border-[#1e2638] bg-transparent px-1 py-0.5 text-xs text-gray-200"
          @change="setFocus(program, ($event.target as HTMLSelectElement).value)"
        >
          <option value="" class="bg-[#0b101b]">fora de foco</option>
          <option v-for="level in FOCUS_LEVELS" :key="level" :value="level" class="bg-[#0b101b]">{{ level }}</option>
        </select>
      </header>
      <p v-if="program.objective" class="text-xs text-gray-300">{{ program.objective }}</p>
      <p v-if="program.windowStart || program.windowEnd" class="text-xs text-[#747e8f]">
        {{ shownWindow(program.windowStart, program.windowEnd) }}
      </p>
      <p v-if="program.exitWhen" class="text-xs text-[#747e8f]">sai quando: {{ program.exitWhen }}</p>

      <p v-if="program.tasks.length === 0" class="text-xs text-[#747e8f]">sem tarefas</p>
      <ul v-else class="flex flex-col gap-1 text-sm">
        <li v-for="task in program.tasks" :key="task.key" class="flex items-center gap-2">
          <button type="button" class="font-mono text-xs text-[#3b82f6] hover:underline" @click="emit('open', task)">
            {{ task.key }}
          </button>
          <span class="text-gray-200">{{ task.title }}</span>
          <span class="ml-auto text-xs text-[#747e8f]">{{ task.status }}</span>
        </li>
      </ul>

      <form class="flex items-center gap-2" @submit.prevent="addTask(program)">
        <input
          v-model="keys[program.id]"
          :aria-label="`Tarefa para ${program.name}`"
          placeholder="LAB-5"
          class="w-28 rounded-md border border-[#1e2638] bg-transparent px-2 py-0.5 text-xs text-gray-200 outline-none focus:border-[#3b82f6]"
        />
        <button type="submit" class="text-xs text-[#747e8f] hover:text-gray-200">Adicionar</button>
      </form>
      <p v-if="refusals[program.id]" role="alert" class="text-xs text-red-300">{{ refusals[program.id] }}</p>
    </article>
  </section>
</template>
