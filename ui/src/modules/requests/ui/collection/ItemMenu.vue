<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import type { Action } from './tree-context.js'

/**
 * O `⋯` de um nível da árvore — a raiz, uma pasta, uma request — e o menu que
 * ele abre. O mesmo menu abre no clique direito, na posição do mouse.
 *
 * Era o `+` (o `AddMenu`), que só criava. Virou `⋯` porque agora também
 * renomeia e apaga, e "+" prometeria só criar. **Onde** a ação acontece
 * continua dito por qual `⋯` foi aberto, não por um campo que pergunta de novo.
 */
const props = defineProps<{
  actions: readonly Action[]
  /** Para o nome acessível: "Opções de Stripe" diz mais que "Opções". */
  where: string
  testid: string
  folderId?: string | null
  requestId?: string
}>()

const emit = defineEmits<{ choose: [action: Action] }>()

/**
 * Um menu aberto por vez, na árvore inteira.
 *
 * O clique direito numa linha não passa por `mousedown` fora do menu aberto em
 * outra — o navegador manda o `mousedown` do botão direito, mas quem abre é o
 * `contextmenu`, e a ordem entre os dois não é a mesma em todo lugar. Um dono
 * único para "qual está aberto" fecha o anterior sem depender dessa ordem.
 */
const me = Symbol('menu')
const open = computed(() => current.value === me)
const at = ref<{ x: number; y: number } | null>(null)

const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const items = useTemplateRef<HTMLButtonElement[]>('items')

function show(point: { x: number; y: number } | null): void {
  at.value = point
  current.value = me
}

function close(): void {
  if (current.value === me) current.value = null
}

/** Abre no ponto do clique direito, em vez de embaixo do `⋯`. */
defineExpose({ openAt: (x: number, y: number) => show({ x, y }) })

function move(step: number): void {
  const list = items.value ?? []
  const index = list.findIndex((item) => item === document.activeElement)
  list[(index + step + list.length) % list.length]?.focus()
}

/**
 * Fechar com Escape e com clique fora, porque um menu que só fecha escolhendo
 * obriga a escolher — e a escolha errada aqui apaga.
 *
 * `mousedown` e não `click`: um `click` fora só chega depois do `mouseup`, e
 * arrastar a partir de fora deixaria o menu aberto sobre o que se arrasta.
 */
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close()
    trigger.value?.focus()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown' ? 1 : -1)
  }
}

const onOutside = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) close()
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

onBeforeUnmount(() => {
  close()
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('mousedown', onOutside)
})

const LABELS: Record<Action, { testid: string; label: string }> = {
  'new-request': { testid: 'menu-new-request', label: 'Nova request' },
  'new-folder': { testid: 'menu-new-folder', label: 'Nova pasta' },
  rename: { testid: 'menu-rename', label: 'Renomear' },
  delete: { testid: 'menu-delete', label: 'Apagar' },
}

const choose = (action: Action) => {
  close()
  // Sem isto o foco cai no `body` quando o item some com o `v-if`.
  trigger.value?.focus()
  emit('choose', action)
}
</script>

<script lang="ts">
import { ref as sharedRef } from 'vue'

/** O menu aberto agora — de toda instância, por isso fora do `setup`. */
const current = sharedRef<symbol | null>(null)
</script>

<template>
  <div ref="root" class="relative" @contextmenu.prevent.stop="show({ x: $event.clientX, y: $event.clientY })">
    <button
      ref="trigger"
      type="button"
      :data-testid="testid"
      :data-folder-id="folderId ?? undefined"
      :data-request-id="requestId"
      :aria-label="`Opções de ${where}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="grid h-5 w-5 place-items-center rounded text-sm leading-none text-[#747e8f] hover:bg-white/5 hover:text-gray-200"
      @click.stop="open ? close() : show(null)"
    >
      ⋯
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="`Opções de ${where}`"
      class="z-20 w-40 overflow-hidden rounded-md border border-[#1e2638] bg-[#0a0d16] py-1 shadow-lg"
      :class="at ? 'fixed' : 'absolute right-0 mt-1'"
      :style="at ? { left: `${at.x}px`, top: `${at.y}px` } : undefined"
    >
      <button
        v-for="action in props.actions"
        :key="action"
        ref="items"
        type="button"
        role="menuitem"
        :data-testid="LABELS[action].testid"
        class="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5"
        :class="action === 'delete' ? 'text-red-300' : 'text-gray-300'"
        @click.stop="choose(action)"
      >
        {{ LABELS[action].label }}
      </button>
    </div>
  </div>
</template>
