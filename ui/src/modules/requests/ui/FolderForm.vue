<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

/**
 * O nome da pasta nova — renderizado **onde** ela vai nascer.
 *
 * Um componente e não markup solto no aside porque ele aparece em dois lugares:
 * no topo, quando o `+` do cabeçalho pediu, e dentro de uma pasta, quando foi o
 * `+` dela. Era isso que faltava: o `+` por pasta dizia onde a coisa nasceria e
 * o formulário abria sempre no topo, então quem clicava dez linhas abaixo não
 * via nada acontecer perto de onde clicou — a pasta-mãe voltava a ser
 * invisível, que é o defeito que o `+` existe para matar.
 */
defineProps<{ error: string | null; saving: boolean; where: string }>()
const emit = defineEmits<{ submit: [name: string] }>()

const name = ref('')
const field = useTemplateRef<HTMLInputElement>('field')

// O foco vai para o campo que a pessoa acabou de pedir. Sem isto ela clica no
// `+`, o campo abre, e o cursor continua onde estava.
onMounted(() => field.value?.focus())

const submit = () => {
  if (name.value.trim() !== '') emit('submit', name.value.trim())
}
</script>

<template>
  <form class="my-1 flex flex-col gap-1.5" @submit.prevent="submit">
    <input
      ref="field"
      v-model="name"
      data-testid="folder-name"
      :aria-label="`Nome da pasta nova em ${where}`"
      placeholder="Nome da pasta"
      class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 text-sm text-gray-200"
    />
    <p
      v-if="error"
      role="alert"
      data-testid="folder-error"
      class="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300"
    >
      {{ error }}
    </p>
    <button
      type="submit"
      data-testid="save-folder"
      :disabled="saving"
      class="self-start rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
    >
      Criar
    </button>
  </form>
</template>
