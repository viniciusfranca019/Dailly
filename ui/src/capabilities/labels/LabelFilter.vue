<script setup lang="ts">
import type { Label } from '@dailly/domain'
import { CHIP } from './label-colors.js'

/**
 * The labels as toggles, the cut both the Daily Log's timeline and the Tasks'
 * board make with them: one button per global label, pressed when it is on.
 * It reports the toggle; the screen keeps the filter and decides what OR means.
 */
const props = defineProps<{
  labels: readonly Label[]
  labelIds: readonly string[]
}>()
const emit = defineEmits<{ toggle: [id: string] }>()
</script>

<template>
  <div v-if="props.labels.length > 0" class="flex flex-wrap gap-1" role="group" aria-label="Filtrar por label">
    <button
      v-for="label in props.labels"
      :key="label.id"
      type="button"
      class="rounded-full border px-2 py-0.5 font-medium transition-opacity"
      :class="[CHIP[label.color], props.labelIds.includes(label.id) ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80']"
      :aria-pressed="props.labelIds.includes(label.id) ? 'true' : 'false'"
      data-testid="filter-label"
      @click="emit('toggle', label.id)"
    >
      {{ label.name }}
    </button>
  </div>
</template>
