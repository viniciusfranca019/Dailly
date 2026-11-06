<script setup lang="ts">
import { LABEL_COLORS, type Label, type LabelColor } from '@dailly/domain'
import { ref } from 'vue'
import { CHIP, COLOR_NAMES } from '@capabilities/labels'

/**
 * Renaming, recoloring and deleting the global labels (card #34, J4). It
 * only reports what was asked; the screen writes and rereads.
 */
const props = defineProps<{ labels: readonly Label[] }>()
const emit = defineEmits<{
  rename: [id: string, name: string]
  recolor: [id: string, color: LabelColor]
  remove: [id: string]
}>()

/** The label whose deletion is being confirmed. */
const confirming = ref<string | null>(null)

function rename(label: Label, event: Event): void {
  const name = (event.target as HTMLInputElement).value
  if (name !== label.name) emit('rename', label.id, name)
}

function confirmRemove(id: string): void {
  confirming.value = null
  emit('remove', id)
}
</script>

<template>
  <details class="mt-4 rounded-md border border-[#1e2638] px-3 py-2 text-sm text-[#747e8f]" data-testid="label-manager">
    <summary class="cursor-pointer select-none">Gerenciar labels</summary>
    <p v-if="props.labels.length === 0" class="mt-2 text-xs">nenhuma label ainda</p>
    <ul class="mt-2 flex flex-col gap-2">
      <li v-for="label in props.labels" :key="label.id" class="flex flex-col gap-1" data-testid="label-row">
        <span class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full border" :class="CHIP[label.color]" aria-hidden="true"></span>
          <input
            :value="label.name"
            type="text"
            :aria-label="`Nome da label ${label.name}`"
            class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-gray-200 focus:border-[#1e2638] focus:outline-none"
            data-testid="label-name"
            @change="rename(label, $event)"
          />
          <select
            :value="label.color"
            :aria-label="`Cor da label ${label.name}`"
            class="rounded border border-[#1e2638] bg-[#121724] px-1 py-0.5 text-xs"
            data-testid="label-color"
            @change="emit('recolor', label.id, ($event.target as HTMLSelectElement).value as LabelColor)"
          >
            <option v-for="color in LABEL_COLORS" :key="color" :value="color">{{ COLOR_NAMES[color] }}</option>
          </select>
          <button
            type="button"
            class="text-xs text-red-400 hover:text-red-300"
            :aria-label="`Apagar a label ${label.name}`"
            data-testid="label-delete"
            @click="confirming = label.id"
          >
            Apagar
          </button>
        </span>
        <span
          v-if="confirming === label.id"
          role="alertdialog"
          :aria-label="`Apagar a label ${label.name}?`"
          class="flex items-center justify-between gap-2 rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200"
        >
          Tirar "{{ label.name }}" de todo registro?
          <span class="flex gap-2">
            <button type="button" data-testid="keep-label" @click="confirming = null">Cancelar</button>
            <button type="button" class="font-medium text-white" data-testid="confirm-label-delete" @click="confirmRemove(label.id)">
              Apagar
            </button>
          </span>
        </span>
      </li>
    </ul>
  </details>
</template>
