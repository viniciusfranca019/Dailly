<script setup lang="ts">
import { PRIORITY_LABELS, formatKey, type Task } from '@dailly/tasks-core'

/** One task in the list: key, title and priority, as Linear's list row. */
defineProps<{ task: Task; completion: string | null }>()
const emit = defineEmits<{ open: [key: number] }>()
</script>

<template>
  <li
    class="flex cursor-pointer items-center gap-3 border-t border-[#1e2638] px-3 py-2 text-sm hover:bg-white/[0.03]"
    @click="emit('open', task.key)"
  >
    <span class="w-12 shrink-0 font-mono text-xs text-[#747e8f]">{{ formatKey(task.key) }}</span>
    <span class="min-w-0 flex-1 truncate text-gray-100">{{ task.title }}</span>
    <span v-if="completion" class="shrink-0 text-xs text-emerald-300">{{ completion }}</span>
    <span class="shrink-0 text-xs text-[#747e8f]">Prioridade: {{ PRIORITY_LABELS[task.priority] }}</span>
  </li>
</template>
