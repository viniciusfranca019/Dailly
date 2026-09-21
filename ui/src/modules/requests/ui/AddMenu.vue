<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * O `+` e as duas coisas que ele cria — uma peça, usada no cabeçalho e em cada
 * pasta.
 *
 * Substituiu dois botões de texto ("Nova pasta" e "Colar curl") por um só, e
 * com isso o select de "dentro de" desapareceu: **onde** nasce é dito por qual
 * `+` foi clicado, não por um campo que pergunta de novo. Duas verdades para a
 * mesma coisa é como a pasta-mãe da tentativa anterior sobrevivia para a
 * seguinte.
 */
const props = defineProps<{
  /** Onde este `+` cria. `null` é a raiz. */
  parentId: string | null
  /** Para o nome acessível: "Adicionar em Stripe" diz mais que "Adicionar". */
  where: string
  testid: string
}>()

const emit = defineEmits<{ newRequest: [parentId: string | null]; newFolder: [parentId: string | null] }>()

const open = ref(false)

/**
 * Fechar com Escape e com clique fora, porque um menu que só fecha escolhendo
 * obriga a escolher — e a escolha errada aqui cria pasta.
 *
 * `mousedown` e não `click`: um `click` fora só chega depois do `mouseup`, e
 * nesse intervalo o menu ainda está aberto por cima do que a pessoa quer
 * alcançar. Os ouvintes só existem enquanto o menu está aberto.
 */
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') open.value = false
}
const onOutside = () => (open.value = false)

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
  } else {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('mousedown', onOutside)
  }
})

// Desmontar com o menu aberto deixaria dois ouvintes no documento para sempre.
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('mousedown', onOutside)
})

const choose = (what: 'request' | 'folder') => {
  open.value = false
  if (what === 'request') emit('newRequest', props.parentId)
  else emit('newFolder', props.parentId)
}
</script>

<template>
  <!-- `@mousedown.stop` para o ouvinte de fora não fechar no mesmo gesto que abre. -->
  <div class="relative" @mousedown.stop>
    <button
      type="button"
      :data-testid="testid"
      :data-folder-id="parentId ?? undefined"
      :aria-label="`Adicionar em ${where}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="grid h-5 w-5 place-items-center rounded text-sm text-[#747e8f] hover:bg-white/5 hover:text-gray-200"
      @click="open = !open"
    >
      +
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-[#1e2638] bg-[#0a0d16] py-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        data-testid="menu-new-request"
        class="block w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-white/5"
        @click="choose('request')"
      >
        Nova request
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="menu-new-folder"
        class="block w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-white/5"
        @click="choose('folder')"
      >
        Nova pasta
      </button>
    </div>
  </div>
</template>
