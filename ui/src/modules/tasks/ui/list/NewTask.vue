<script setup lang="ts">
import { TitleRequiredError, normalizeTitle } from '@dailly/tasks-core'
import { onMounted, ref } from 'vue'

/**
 * The inline capture under a status's "+": a title, Enter to create.
 *
 * The title rule is the model's (`normalizeTitle`), the same one the server
 * applies, so an empty title is refused here without a round trip (C5). What
 * was typed stays in the field whatever fails (C6): the field is cleared only
 * by the parent closing this form after a success.
 */
const props = defineProps<{ statusName: string; create: (title: string) => Promise<void> }>()
const emit = defineEmits<{ cancel: [] }>()

const title = ref('')
const error = ref<string | null>(null)
const saving = ref(false)
const field = ref<HTMLInputElement | null>(null)

onMounted(() => field.value?.focus())

async function submit(): Promise<void> {
  if (saving.value) return
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
  saving.value = true
  error.value = null
  try {
    await props.create(normalized)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui criar a tarefa'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-1 px-3 py-2" @submit.prevent="submit">
    <div class="flex items-center gap-2">
      <input
        ref="field"
        v-model="title"
        type="text"
        :aria-label="'Título da nova tarefa'"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? 'new-task-error' : undefined"
        :placeholder="`Nova tarefa em ${statusName}`"
        class="min-w-0 flex-1 rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-sm text-gray-100 outline-none focus:border-[#3b82f6]"
        @keydown.esc="emit('cancel')"
      />
      <button
        type="submit"
        :disabled="saving"
        class="rounded-md bg-[#3b82f6] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        Criar
      </button>
      <button type="button" class="px-1 text-xs text-[#747e8f] hover:text-gray-200" @click="emit('cancel')">
        Cancelar
      </button>
    </div>
    <p v-if="error" id="new-task-error" role="alert" class="text-xs text-red-300">{{ error }}</p>
  </form>
</template>
