<script setup lang="ts">
import type { TaskStatus } from '@dailly/tasks-core'
import { computed, onMounted, ref } from 'vue'

/**
 * Delete a status (card #43, J6.3, J6.4). With tasks in it, the person picks
 * where they go, among the other statuses of the board; with none, it only
 * asks for the confirmation. A refusal (the last status of the board, RN11)
 * shows here, and nothing changes; "Cancelar" changes nothing either (J6.4a).
 */
const props = defineProps<{
  status: TaskStatus
  /** The other statuses of the board, in order. */
  others: readonly TaskStatus[]
  taskCount: number
  remove: (moveTo: string | undefined) => Promise<void>
}>()
const emit = defineEmits<{ cancel: [] }>()

const moveTo = ref(props.others[0]?.id ?? '')
/**
 * A destination only when there are tasks and somewhere else to put them: the
 * last status of the board has none, and then the store's refusal (RN11) is
 * the answer, not a malformed `moveTo`.
 */
const needsDestination = computed(() => props.taskCount > 0 && props.others.length > 0)
const cancelButton = ref<HTMLButtonElement | null>(null)

onMounted(() => cancelButton.value?.focus())
const error = ref<string | null>(null)
const busy = ref(false)

async function confirm(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    await props.remove(needsDestination.value ? moveTo.value : undefined)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui apagar o status'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    role="alertdialog"
    aria-modal="true"
    :aria-label="`Apagar o status ${status.name}?`"
    class="absolute right-6 top-14 z-20 flex w-80 flex-col gap-2 rounded-lg border border-red-500/20 bg-[#0b101b] p-3 text-sm shadow-xl"
    @keydown.esc="emit('cancel')"
  >
    <p class="text-gray-200">Apagar o status "{{ status.name }}"?</p>
    <label v-if="needsDestination" class="flex flex-col gap-1 text-xs text-[#747e8f]">
      {{ taskCount === 1 ? 'A tarefa dele vai' : `As ${taskCount} tarefas dele vão` }} para o topo de
      <select
        v-model="moveTo"
        aria-label="Mover as tarefas para"
        class="rounded-md border border-[#1e2638] bg-[#0f1522] px-2 py-1 text-sm text-gray-100"
      >
        <option v-for="other in others" :key="other.id" :value="other.id">{{ other.name }}</option>
      </select>
    </label>
    <p v-if="error" role="alert" class="text-xs text-red-300">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <button ref="cancelButton" type="button" class="px-2 py-1 text-xs text-gray-300" @click="emit('cancel')">
        Cancelar
      </button>
      <button
        type="button"
        :disabled="busy"
        class="rounded-md bg-red-500 px-2 py-1 text-xs text-white disabled:opacity-50"
        @click="confirm"
      >
        Apagar status
      </button>
    </div>
  </div>
</template>
