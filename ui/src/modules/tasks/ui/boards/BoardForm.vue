<script setup lang="ts">
import { InvalidPrefixError, NameRequiredError, normalizeBoardName, normalizePrefix } from '@dailly/tasks-core'
import { onMounted, ref } from 'vue'

/**
 * Create a board, or edit its name and prefix (card #42, J5.1 and J5.4).
 *
 * The rules are the model's (`normalizeBoardName`, `normalizePrefix`), the
 * same ones the server applies, so an empty name or a malformed prefix is
 * refused without a round trip; a prefix another board used (RN9) only the
 * server knows, and its refusal shows here the same way. What was typed stays
 * whatever fails: only the parent closes the form, after a success.
 */
const props = defineProps<{
  title: string
  submitLabel: string
  initial?: { name: string; prefix: string }
  save: (input: { name: string; prefix: string }) => Promise<void>
}>()
const emit = defineEmits<{ cancel: [] }>()

const name = ref(props.initial?.name ?? '')
const prefix = ref(props.initial?.prefix ?? '')
const error = ref<string | null>(null)
const saving = ref(false)
const nameField = ref<HTMLInputElement | null>(null)

onMounted(() => nameField.value?.focus())

/** Uppercase as the person types; anything else the rule refuses, with its reason. */
function typePrefix(event: Event): void {
  prefix.value = (event.target as HTMLInputElement).value.toUpperCase()
}

async function submit(): Promise<void> {
  if (saving.value) return
  let input: { name: string; prefix: string }
  try {
    input = { name: normalizeBoardName(name.value), prefix: normalizePrefix(prefix.value) }
  } catch (cause) {
    if (cause instanceof NameRequiredError || cause instanceof InvalidPrefixError) {
      error.value = cause.message
      return
    }
    throw cause
  }
  saving.value = true
  error.value = null
  try {
    await props.save(input)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui salvar o board'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form
    :aria-label="title"
    class="absolute right-6 top-14 z-20 flex w-72 flex-col gap-2 rounded-lg border border-[#1e2638] bg-[#0b101b] p-3 shadow-xl"
    @submit.prevent="submit"
    @keydown.esc="emit('cancel')"
  >
    <h2 class="text-sm font-medium text-gray-200">{{ title }}</h2>
    <label class="flex flex-col gap-1 text-xs text-[#747e8f]">
      Nome
      <input
        ref="nameField"
        v-model="name"
        type="text"
        aria-label="Nome do board"
        placeholder="Casa"
        class="rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-sm text-gray-100 outline-none focus:border-[#3b82f6]"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs text-[#747e8f]">
      Prefixo das chaves
      <input
        :value="prefix"
        type="text"
        aria-label="Prefixo do board"
        placeholder="CASA"
        autocapitalize="characters"
        spellcheck="false"
        class="rounded-md border border-[#1e2638] bg-transparent px-2 py-1 font-mono text-sm uppercase text-gray-100 outline-none focus:border-[#3b82f6]"
        @input="typePrefix"
      />
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
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
