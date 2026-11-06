<script setup lang="ts">
import type { TaskStatus } from '@dailly/tasks-core'
import { DOT } from '../../model/status-colors.js'

/**
 * The head of a column or a group: the status's color, name and count, and
 * its two actions (card #43). The same in the board and in the list, so a
 * status is managed from either view.
 */
defineProps<{ status: TaskStatus; count: number }>()
const emit = defineEmits<{ edit: []; remove: [] }>()
</script>

<template>
  <span :data-color="status.color" :class="DOT[status.color]" class="size-2 shrink-0 rounded-full" aria-hidden="true" />
  <h2 class="text-sm font-medium text-gray-200">{{ status.name }}</h2>
  <span class="text-xs text-[#747e8f]">{{ count }}</span>
  <button
    type="button"
    :aria-label="`Editar status ${status.name}`"
    title="Editar status"
    class="rounded px-1 text-xs text-[#747e8f] opacity-60 hover:bg-[#1e2638] hover:text-gray-100 hover:opacity-100"
    @click="emit('edit')"
  >
    ✎
  </button>
  <button
    type="button"
    :aria-label="`Apagar status ${status.name}`"
    title="Apagar status"
    class="rounded px-1 text-xs text-[#747e8f] opacity-60 hover:bg-red-500/10 hover:text-red-300 hover:opacity-100"
    @click="emit('remove')"
  >
    ✕
  </button>
</template>
