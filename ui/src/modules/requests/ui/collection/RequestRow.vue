<script setup lang="ts">
import type { SavedRequest } from '@dailly/requests-core'
import { computed, useTemplateRef } from 'vue'
import ConfirmDelete from './ConfirmDelete.vue'
import InlineRename from './InlineRename.vue'
import ItemMenu from './ItemMenu.vue'
import { actionsFor, useTree } from './tree-context.js'
import { methodOf } from '../../model/tree.js'

/**
 * Uma request na árvore: o método colorido, o nome, o `⋯`.
 *
 * Arrasta-se pela linha inteira. Soltar **sobre** uma request não é com ela:
 * o evento sobe até a pasta que a contém, e é para lá que o item vai — que é o
 * que a mão espera quando mira "aquela pasta aberta".
 */
const props = defineProps<{ request: SavedRequest }>()
const tree = useTree()
const item = computed(() => ({ kind: 'request', item: props.request }) as const)
const menu = useTemplateRef<InstanceType<typeof ItemMenu>>('menu')

const method = computed(() => methodOf(props.request))

/** Classes inteiras, para o Tailwind enxergar cada uma no código. */
const TONE: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-orange-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
}

const editing = computed(() => {
  const now = tree.editing.value
  return now?.target.kind === 'request' && now.target.item.id === props.request.id ? now.mode : null
})

function onDragStart(event: DragEvent): void {
  // O `dataTransfer` precisa de algo dentro para o Firefox começar o arrasto;
  // o que vale é o estado da árvore, não este texto.
  event.dataTransfer?.setData('text/plain', props.request.name)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  tree.startDrag({ kind: 'request', item: props.request })
}

function onContextMenu(event: MouseEvent): void {
  menu.value?.openAt(event.clientX, event.clientY)
}
</script>

<template>
  <li>
    <InlineRename
      v-if="editing === 'rename'"
      :initial="request.name"
      :error="tree.renameError.value"
      @submit="tree.rename(item, $event)"
      @cancel="tree.cancel()"
    />
    <div
      v-else
      class="group flex items-center gap-1 rounded pr-1 hover:bg-white/5"
      :class="{ 'bg-white/5': request.id === tree.selected.value }"
      draggable="true"
      @dragstart.stop="onDragStart"
      @dragend.stop="tree.endDrag()"
      @contextmenu.prevent.stop="onContextMenu"
    >
      <button
        type="button"
        data-testid="request"
        :data-request-id="request.id"
        :aria-current="request.id === tree.selected.value ? 'true' : undefined"
        class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-sm"
        :class="request.id === tree.selected.value ? 'text-gray-100' : 'text-gray-400'"
        @click="tree.pick(request)"
      >
        <span
          data-testid="method"
          :data-method="method"
          class="w-12 shrink-0 font-mono text-[11px] font-semibold"
          :class="TONE[method] ?? 'text-gray-400'"
        >{{ method }}</span>
        <span data-testid="request-name" class="truncate">{{ request.name }}</span>
      </button>
      <ItemMenu
        ref="menu"
        :actions="actionsFor(item)"
        :where="request.name"
        testid="request-menu"
        :request-id="request.id"
        class="opacity-60 group-hover:opacity-100"
        @choose="tree.act(item, $event)"
      />
    </div>
    <ConfirmDelete
      v-if="editing === 'delete'"
      :message="`Apagar «${request.name}»?`"
      @yes="tree.remove(item)"
      @no="tree.cancel()"
    />
  </li>
</template>
