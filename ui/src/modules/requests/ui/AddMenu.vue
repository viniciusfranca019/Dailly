<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

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
 *
 * O teste do alvo é feito **aqui**, e não com um `.stop` na raiz. O `.stop`
 * resolvia o "não feche no gesto que abre" e criava outro problema: o gesto
 * morria antes do documento, então abrir um segundo `+` não fechava o
 * primeiro. Dois menus `absolute z-10` sobrepostos, e clicar no item de um
 * acerta o do outro — a request nascendo na pasta errada, que é o oposto do
 * que este menu existe para garantir.
 */
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const items = useTemplateRef<HTMLButtonElement[]>('items')

/**
 * O foco entra no menu e volta para o `+`.
 *
 * `role="menu"` sem isto anuncia um menu e entrega um par de botões soltos: ao
 * abrir, o foco fica para trás e é preciso caçar com Tab o que se acabou de
 * pedir; ao escolher, o item some do DOM e o foco cai no `body`. São dois
 * itens — o padrão inteiro cabe em dez linhas, e meia semântica é o defeito
 * que este arquivo já cometeu uma vez.
 */
function move(step: number): void {
  const list = items.value ?? []
  const at = list.findIndex((item) => item === document.activeElement)
  list[(at + step + list.length) % list.length]?.focus()
}

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    open.value = false
    trigger.value?.focus()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown' ? 1 : -1)
  }
}
const onOutside = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    void nextTick(() => items.value?.[0]?.focus())
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

/**
 * Os itens como dados, e não como dois blocos de markup.
 *
 * Não é economia de linhas: `ref="items"` em dois elementos irmãos **fora** de
 * um `v-for` não faz array — o último vence — e o foco ia para lugar nenhum.
 */
const ITEMS = [
  { what: 'request', testid: 'menu-new-request', label: 'Nova request' },
  { what: 'folder', testid: 'menu-new-folder', label: 'Nova pasta' },
] as const

const choose = (what: 'request' | 'folder') => {
  open.value = false
  // Sem isto o foco cai no `body` quando o item some com o `v-if`.
  trigger.value?.focus()
  if (what === 'request') emit('newRequest', props.parentId)
  else emit('newFolder', props.parentId)
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
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
        v-for="item in ITEMS"
        :key="item.testid"
        ref="items"
        type="button"
        role="menuitem"
        :data-testid="item.testid"
        class="block w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-white/5"
        @click="choose(item.what)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
