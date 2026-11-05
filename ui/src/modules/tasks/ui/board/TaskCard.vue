<script setup lang="ts">
import { PRIORITY_LABELS, formatKey, type Task } from '@dailly/tasks-core'

/** One card of the board: key, title, priority and, when closed, the day. */
defineProps<{ task: Task; completion: string | null }>()
const emit = defineEmits<{ grab: [key: number]; release: []; drop: [beforeKey: number]; open: [key: number] }>()

function start(event: DragEvent, key: number): void {
  // Firefox starts no drag without data; the key is also what a drop
  // elsewhere would read. jsdom has no DataTransfer, hence the guard.
  event.dataTransfer?.setData('text/plain', formatKey(key))
  emit('grab', key)
}
</script>

<template>
  <li
    draggable="true"
    class="cursor-grab rounded-md border border-[#1e2638] bg-[#0f1522] px-3 py-2 text-sm active:cursor-grabbing"
    @dragstart="start($event as DragEvent, task.key)"
    @dragend="emit('release')"
    @click="emit('open', task.key)"
    @dragover.prevent
    @drop.prevent.stop="emit('drop', task.key)"
  >
    <div class="flex items-center gap-2">
      <span class="font-mono text-xs text-[#747e8f]">{{ formatKey(task.key) }}</span>
      <span class="ml-auto text-xs text-[#747e8f]">Prioridade: {{ PRIORITY_LABELS[task.priority] }}</span>
    </div>
    <!-- The keyboard's way in (Tab, Enter): the card itself is a drag handle. -->
    <button type="button" class="mt-1 block w-full text-left text-gray-100" @click.stop="emit('open', task.key)">
      {{ task.title }}
    </button>
    <p v-if="completion" class="mt-1 text-xs text-emerald-300">{{ completion }}</p>
  </li>
</template>
