<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

/**
 * O nome editável no lugar da linha — Enter salva, Escape desiste.
 *
 * Vazio é recusado aqui, antes da API: o servidor também recusaria, mas a
 * resposta dele chegaria como erro da coleção inteira, longe do campo. O erro
 * que vem do servidor (`error`) aparece no mesmo lugar, para a pessoa corrigir
 * sem reabrir o menu.
 */
const props = defineProps<{ initial: string; error: string | null }>()
const emit = defineEmits<{ submit: [name: string]; cancel: [] }>()

const value = ref(props.initial)
const empty = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

onMounted(() => {
  input.value?.focus()
  input.value?.select()
})

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key !== 'Enter') return
  event.preventDefault()
  const name = value.value.trim()
  empty.value = name === ''
  if (!empty.value) emit('submit', name)
}
</script>

<template>
  <div class="flex flex-col gap-1 px-2 py-0.5">
    <input
      ref="input"
      v-model="value"
      data-testid="rename"
      aria-label="Novo nome"
      class="w-full rounded border border-blue-500/60 bg-[#0a0d16] px-1.5 py-0.5 text-sm text-gray-100 outline-none"
      @keydown="onKey"
    />
    <p v-if="empty || error" data-testid="rename-error" role="alert" class="text-xs text-red-300">
      {{ empty ? 'o nome não pode ficar vazio' : error }}
    </p>
  </div>
</template>
