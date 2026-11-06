<script setup lang="ts">
import { CHIP } from '@capabilities/labels'
import type { Label } from '@shared'
import { computed } from 'vue'

/** The labels of a task on its card and its row, after the title, as the timeline shows them (card #46). */
const props = defineProps<{ ids: readonly string[]; labels: readonly Label[] }>()

const shown = computed(() =>
  props.ids.map((id) => props.labels.find((label) => label.id === id)).filter((label): label is Label => label !== undefined),
)
</script>

<template>
  <span v-if="shown.length > 0" class="inline-flex flex-wrap gap-1">
    <span
      v-for="label in shown"
      :key="label.id"
      :data-label="label.id"
      :data-color="label.color"
      class="rounded-full border px-1.5 text-[10px] font-medium leading-4"
      :class="CHIP[label.color]"
    >
      {{ label.name }}
    </span>
  </span>
</template>
