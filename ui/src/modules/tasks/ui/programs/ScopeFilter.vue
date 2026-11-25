<script setup lang="ts">
/**
 * A row of toggles above the board, the program and the focus filters: one
 * button per option, pressed when it is on. It reports the toggle; the screen
 * keeps the selection and cuts the board. A failed read says so in place of
 * the chips, since a filter with no options read would be a false "none".
 */
const props = defineProps<{
  label: string
  options: readonly { readonly id: string; readonly name: string }[]
  selected: readonly string[]
  error: string | null
}>()
const emit = defineEmits<{ toggle: [id: string] }>()
</script>

<template>
  <p v-if="props.error" class="text-red-300">{{ props.error }}</p>
  <div v-else-if="props.options.length > 0" class="flex flex-wrap gap-1" role="group" :aria-label="props.label">
    <button
      v-for="option in props.options"
      :key="option.id"
      type="button"
      class="rounded-full border border-[#2a3347] px-2 py-0.5 font-medium text-gray-200 transition-opacity"
      :class="props.selected.includes(option.id) ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80'"
      :aria-pressed="props.selected.includes(option.id) ? 'true' : 'false'"
      @click="emit('toggle', option.id)"
    >
      {{ option.name }}
    </button>
  </div>
</template>
