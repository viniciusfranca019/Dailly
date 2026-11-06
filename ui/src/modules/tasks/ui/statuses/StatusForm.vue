<script setup lang="ts">
import {
  CATEGORY_ORDER,
  NameRequiredError,
  STATUS_COLORS,
  normalizeStatusName,
  type StatusCategory,
  type StatusColor,
  type TaskStatus,
} from '@dailly/tasks-core'
import { onMounted, ref } from 'vue'
import { CATEGORY_NAMES, COLOR_NAMES } from '../../model/status-colors.js'

/**
 * Add a status to the board, or rename and recolor one (card #43, J6.1, J6.2).
 * The category is chosen only when adding: changing it later would stamp or
 * clear the "concluída em" of tasks that did not move (RN3). An empty name is
 * refused here; a name taken in the board only the store knows, and its
 * refusal shows the same way. Only the parent closes the form, after a success.
 */
const props = defineProps<{
  editing?: TaskStatus
  save: (input: { name: string; category: StatusCategory; color: StatusColor }) => Promise<void>
}>()
const emit = defineEmits<{ cancel: [] }>()

const name = ref(props.editing?.name ?? '')
const category = ref<StatusCategory>(props.editing?.category ?? 'started')
const color = ref<StatusColor>(props.editing?.color ?? 'purple')
const error = ref<string | null>(null)
const saving = ref(false)
const nameField = ref<HTMLInputElement | null>(null)

onMounted(() => nameField.value?.focus())

async function submit(): Promise<void> {
  if (saving.value) return
  let normalized: string
  try {
    normalized = normalizeStatusName(name.value)
  } catch (cause) {
    if (cause instanceof NameRequiredError) {
      error.value = cause.message
      return
    }
    throw cause
  }
  saving.value = true
  error.value = null
  try {
    await props.save({ name: normalized, category: category.value, color: color.value })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui salvar o status'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form
    :aria-label="editing ? 'Editar status' : 'Novo status'"
    class="absolute right-6 top-14 z-20 flex w-72 flex-col gap-2 rounded-lg border border-[#1e2638] bg-[#0b101b] p-3 shadow-xl"
    @submit.prevent="submit"
    @keydown.esc="emit('cancel')"
  >
    <h2 class="text-sm font-medium text-gray-200">{{ editing ? 'Editar status' : 'Novo status' }}</h2>
    <label class="flex flex-col gap-1 text-xs text-[#747e8f]">
      Nome
      <input
        ref="nameField"
        v-model="name"
        type="text"
        aria-label="Nome do status"
        placeholder="Revisão"
        class="rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-sm text-gray-100 outline-none focus:border-[#3b82f6]"
      />
    </label>
    <label v-if="!editing" class="flex flex-col gap-1 text-xs text-[#747e8f]">
      Categoria
      <select
        v-model="category"
        aria-label="Categoria"
        class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-sm text-gray-100"
      >
        <option v-for="option in CATEGORY_ORDER" :key="option" :value="option">{{ CATEGORY_NAMES[option] }}</option>
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-[#747e8f]">
      Cor
      <select
        v-model="color"
        aria-label="Cor"
        class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-sm text-gray-100"
      >
        <option v-for="option in STATUS_COLORS" :key="option" :value="option">{{ COLOR_NAMES[option] }}</option>
      </select>
    </label>
    <p v-if="error" role="alert" class="text-xs text-red-300">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <button type="button" class="px-1 text-xs text-[#747e8f] hover:text-gray-200" @click="emit('cancel')">
        Cancelar
      </button>
      <button
        type="submit"
        :disabled="saving"
        class="rounded-md bg-[#3b82f6] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {{ editing ? 'Salvar' : 'Adicionar' }}
      </button>
    </div>
  </form>
</template>
