<script setup lang="ts">
import { formatPropertyValue, type Label, type PropertyDef, type PropertyValue } from '@dailly/domain'
import { ref } from 'vue'
import { CHIP } from '@capabilities/labels'

/**
 * Cutting the timeline (card #36): labels toggled on combine with OR, each
 * property added narrows with AND (RN4). It reports what was asked; the
 * screen parses, keeps the filter and rereads.
 */
const props = defineProps<{
  labels: readonly Label[]
  defs: readonly PropertyDef[]
  labelIds: readonly string[]
  values: Readonly<Record<string, PropertyValue>>
}>()
const emit = defineEmits<{ toggle: [id: string]; addProp: [key: string, raw: string]; dropProp: [key: string]; clear: [] }>()

const key = ref('')
const raw = ref('')

function add(): void {
  if (key.value === '') return
  emit('addProp', key.value, raw.value)
}
</script>

<template>
  <div class="mb-4 flex flex-col gap-2 text-xs" data-testid="filter">
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

    <div v-if="props.defs.length > 0" class="flex flex-wrap items-center gap-1.5">
      <select
        v-model="key"
        aria-label="Filtrar pela propriedade"
        class="rounded-md border border-[#1e2638] bg-[#121724] px-1 py-1 text-gray-300"
        data-testid="filter-key"
      >
        <option value="">propriedade…</option>
        <option v-for="def in props.defs" :key="def.key" :value="def.key">{{ def.key }}</option>
      </select>
      <input
        v-model="raw"
        type="text"
        placeholder="valor"
        aria-label="Valor do filtro"
        class="w-24 rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-gray-200 placeholder:text-[#747e8f] focus:border-blue-500/50 focus:outline-none"
        data-testid="filter-value"
        @keydown.enter.prevent="add"
      />
      <button type="button" class="rounded-md px-2 py-1 text-[#747e8f] hover:text-gray-200" data-testid="filter-add" @click="add">
        Filtrar
      </button>
      <span
        v-for="(value, name) in props.values"
        :key="name"
        class="inline-flex items-center gap-1 rounded-md border border-[#1e2638] px-2 py-0.5 text-gray-300"
        data-testid="filter-prop"
      >
        <span data-testid="filter-prop-text">{{ name }} = {{ formatPropertyValue(value) }}</span>
        <button type="button" :aria-label="`Tirar o filtro ${name}`" @click="emit('dropProp', String(name))">×</button>
      </span>
    </div>

    <button
      v-if="props.labelIds.length > 0 || Object.keys(props.values).length > 0"
      type="button"
      class="w-fit text-[#747e8f] underline hover:text-gray-200"
      data-testid="filter-clear"
      @click="emit('clear')"
    >
      Limpar filtro
    </button>
  </div>
</template>
