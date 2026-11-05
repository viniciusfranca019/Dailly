<script setup lang="ts">
import type { Label } from '@dailly/domain'
import { computed, ref } from 'vue'
import { CHIP } from '../model/label-colors.js'

/**
 * The labels of the entry being written or corrected (card #34): the chosen
 * ones as chips, and a field that suggests the existing labels and creates a
 * new one on Enter. Deciding "existing or new" is the screen's, not this
 * component's: it only says what name was asked for.
 */
const props = defineProps<{ labels: readonly Label[]; chosen: readonly string[] }>()
const emit = defineEmits<{ add: [name: string]; remove: [id: string] }>()

const draft = ref('')
const chips = computed(() =>
  props.chosen
    .map((id) => props.labels.find((label) => label.id === id))
    .filter((label): label is Label => label !== undefined),
)

function add(): void {
  emit('add', draft.value)
  draft.value = ''
}
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-1.5" data-testid="labels">
    <span
      v-for="label in chips"
      :key="label.id"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      :class="CHIP[label.color]"
      data-testid="chosen-label"
    >
      <span data-testid="chosen-label-name">{{ label.name }}</span>
      <button type="button" class="opacity-70 hover:opacity-100" :aria-label="`Tirar ${label.name}`" @click="emit('remove', label.id)">
        ×
      </button>
    </span>
    <input
      v-model="draft"
      type="text"
      list="daily-log-labels"
      placeholder="+ label"
      aria-label="Adicionar label"
      class="w-32 rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-xs text-gray-200 placeholder:text-[#747e8f] focus:border-blue-500/50 focus:outline-none"
      data-testid="label-input"
      @keydown.enter.prevent="add"
    />
    <datalist id="daily-log-labels">
      <option v-for="label in props.labels" :key="label.id" :value="label.name" />
    </datalist>
  </div>
</template>
