<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'

/**
 * A confirmação de apagar, no lugar da linha, e não um `window.confirm`.
 *
 * O diálogo do navegador não diz nada que esta tela saiba — quantas requests
 * e subpastas vão junto — e não é testável no jsdom. O foco começa em
 * "Cancelar": o Enter distraído não pode ser o que apaga.
 */
defineProps<{ message: string }>()
const emit = defineEmits<{ yes: []; no: [] }>()

const cancel = useTemplateRef<HTMLButtonElement>('cancel')
onMounted(() => cancel.value?.focus())
</script>

<template>
  <div
    role="alertdialog"
    aria-label="Confirmar exclusão"
    data-testid="confirm-delete"
    class="mx-2 my-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200"
    @keydown.escape.prevent="emit('no')"
  >
    <p>{{ message }}</p>
    <div class="mt-1.5 flex gap-2">
      <button
        type="button"
        data-testid="confirm-delete-yes"
        class="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500"
        @click="emit('yes')"
      >
        Apagar
      </button>
      <button
        ref="cancel"
        type="button"
        data-testid="confirm-delete-no"
        class="rounded border border-red-400/30 px-2 py-0.5 hover:bg-red-500/10"
        @click="emit('no')"
      >
        Cancelar
      </button>
    </div>
  </div>
</template>
