<script setup lang="ts">
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_NAMES,
  formatPropertyValue,
  type PropertyDef,
  type PropertyType,
  type PropertyValue,
} from '@dailly/domain'
import { computed, ref, watch } from 'vue'

/**
 * The properties of the entry on the board (card #35): the chosen ones as
 * "key: value" chips, and a small form whose key field suggests the defined
 * keys with their type. A key with no definition asks for its type, once.
 * Parsing and defining are the screen's; this only reports what was asked.
 */
const props = defineProps<{ defs: readonly PropertyDef[]; values: Readonly<Record<string, PropertyValue>> }>()
const emit = defineEmits<{ add: [key: string, type: PropertyType, raw: string]; remove: [key: string] }>()

const key = ref('')
const kind = ref<PropertyType>('text')
const raw = ref('')

const known = computed(() => props.defs.find((def) => def.key === key.value.trim()))
const type = computed<PropertyType>(() => known.value?.type ?? kind.value)

// A yes/no starts at "sim", so the select never sends an empty value.
watch(type, (now) => {
  if (now === 'boolean' && raw.value !== 'sim' && raw.value !== 'não') raw.value = 'sim'
})

function add(): void {
  emit('add', key.value, type.value, raw.value)
  key.value = ''
  raw.value = ''
  kind.value = 'text'
}
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-testid="properties">
    <span
      v-for="(value, name) in props.values"
      :key="name"
      class="inline-flex items-center gap-1 rounded-md border border-[#1e2638] px-2 py-0.5 text-gray-300"
      data-testid="chosen-prop"
    >
      <span data-testid="chosen-prop-text">{{ name }}: {{ formatPropertyValue(value) }}</span>
      <button type="button" class="opacity-70 hover:opacity-100" :aria-label="`Tirar ${name}`" @click="emit('remove', String(name))">
        ×
      </button>
    </span>

    <input
      v-model="key"
      type="text"
      list="daily-log-props"
      placeholder="+ propriedade"
      aria-label="Chave da propriedade"
      class="w-32 rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-gray-200 placeholder:text-[#747e8f] focus:border-blue-500/50 focus:outline-none"
      data-testid="prop-key"
    />
    <datalist id="daily-log-props">
      <option v-for="def in props.defs" :key="def.key" :value="def.key" :label="`${def.key} · ${PROPERTY_TYPE_NAMES[def.type]}`" />
    </datalist>

    <select
      v-if="key.trim() !== '' && !known"
      v-model="kind"
      aria-label="Tipo da propriedade nova"
      class="rounded-md border border-[#1e2638] bg-[#121724] px-1 py-1 text-gray-300"
      data-testid="prop-type"
    >
      <option v-for="option in PROPERTY_TYPES" :key="option" :value="option">{{ PROPERTY_TYPE_NAMES[option] }}</option>
    </select>

    <select
      v-if="type === 'boolean'"
      v-model="raw"
      aria-label="Valor da propriedade"
      class="rounded-md border border-[#1e2638] bg-[#121724] px-1 py-1 text-gray-300"
      data-testid="prop-value"
    >
      <option value="sim">sim</option>
      <option value="não">não</option>
    </select>
    <input
      v-else
      v-model="raw"
      type="text"
      :inputmode="type === 'number' ? 'decimal' : 'text'"
      placeholder="valor"
      aria-label="Valor da propriedade"
      class="w-24 rounded-md border border-[#1e2638] bg-transparent px-2 py-1 text-gray-200 placeholder:text-[#747e8f] focus:border-blue-500/50 focus:outline-none"
      data-testid="prop-value"
      @keydown.enter.prevent="add"
    />

    <button type="button" class="rounded-md px-2 py-1 text-[#747e8f] hover:text-gray-200" data-testid="prop-add" @click="add">
      Adicionar
    </button>
  </div>
</template>
