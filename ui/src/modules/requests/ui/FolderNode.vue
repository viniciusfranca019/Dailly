<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import ConfirmDelete from './ConfirmDelete.vue'
import FolderForm from './FolderForm.vue'
import InlineRename from './InlineRename.vue'
import ItemMenu from './ItemMenu.vue'
import RequestRow from './RequestRow.vue'
import { actionsFor, useTree } from './tree-context.js'
import { type TreeFolder, totals } from './tree.js'

/**
 * Um galho da árvore — recursivo, porque a árvore é.
 *
 * A linha é a do Apidog: seta, pasta, nome e quantas requests ela carrega em
 * toda a descendência. O `<li>` inteiro é alvo de soltar — a linha e o
 * conteúdo aberto —, e para a propagação, para que soltar dentro de uma
 * subpasta não seja também soltar em cada pasta acima dela.
 */
const props = defineProps<{
  node: TreeFolder
  /** A pasta cujo formulário de nome está aberto — `undefined` é nenhum. */
  namingIn: string | null | undefined
  folderError: string | null
  savingFolder: boolean
}>()

const emit = defineEmits<{ createFolder: [input: { name: string; parentId: string | null }] }>()

const tree = useTree()
const id = computed(() => props.node.folder.id)
const item = computed(() => ({ kind: 'folder', item: props.node.folder }) as const)
const open = computed(() => tree.isOpen(id.value))
const count = computed(() => totals(props.node))
const menu = useTemplateRef<InstanceType<typeof ItemMenu>>('menu')
const lit = computed(() => tree.isLit(id.value))

const editing = computed(() => {
  const now = tree.editing.value
  return now?.target.kind === 'folder' && now.target.item.id === id.value ? now.mode : null
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const deleteMessage = computed(() => {
  const { requests, folders } = count.value
  const inside = [
    requests > 0 ? plural(requests, 'request', 'requests') : null,
    folders > 0 ? plural(folders, 'subpasta', 'subpastas') : null,
  ].filter(Boolean)
  const name = props.node.folder.name
  return inside.length === 0
    ? `Apagar a pasta «${name}»? Ela está vazia.`
    : `Apagar a pasta «${name}» e tudo dentro dela: ${inside.join(' e ')}?`
})

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', props.node.folder.name)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  tree.startDrag({ kind: 'folder', item: props.node.folder })
}

/** Aceitar é chamar `preventDefault` no `dragover`; recusar é não chamar. */
function onDragOver(event: DragEvent): void {
  tree.hover(id.value)
  if (!tree.canDropOn(id.value)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDrop(event: DragEvent): void {
  if (!tree.canDropOn(id.value)) {
    tree.hover(undefined)
    return
  }
  event.preventDefault()
  tree.dropOn(id.value)
}

function onContextMenu(event: MouseEvent): void {
  menu.value?.openAt(event.clientX, event.clientY)
}
</script>

<template>
  <li
    class="rounded"
    :class="{ 'bg-blue-500/10 ring-1 ring-blue-500/40': lit }"
    :data-drop-target="lit ? node.folder.id : undefined"
    @dragover.stop="onDragOver"
    @drop.stop="onDrop"
  >
    <InlineRename
      v-if="editing === 'rename'"
      :initial="node.folder.name"
      :error="tree.renameError.value"
      @submit="tree.rename(item, $event)"
      @cancel="tree.cancel()"
    />
    <div
      v-else
      class="group flex items-center gap-1 rounded pr-1 hover:bg-white/5"
      draggable="true"
      @dragstart.stop="onDragStart"
      @dragend.stop="tree.endDrag()"
      @contextmenu.prevent.stop="onContextMenu"
    >
      <button
        type="button"
        data-testid="folder"
        :data-folder-id="node.folder.id"
        :aria-expanded="open"
        class="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-sm text-gray-300"
        @click="tree.toggle(node.folder.id)"
      >
        <span aria-hidden="true" class="w-3 shrink-0 text-[10px] text-[#747e8f]">{{ open ? '▾' : '▸' }}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" class="h-3.5 w-3.5 shrink-0 fill-none stroke-current text-[#9aa4b5]">
          <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
        </svg>
        <span data-testid="folder-label" class="truncate">{{ node.folder.name }}</span>
        <span data-testid="folder-count" class="shrink-0 text-xs text-[#747e8f]">({{ count.requests }})</span>
      </button>
      <ItemMenu
        ref="menu"
        :actions="actionsFor(item)"
        :where="node.folder.name"
        testid="add-in-folder"
        :folder-id="node.folder.id"
        class="opacity-60 group-hover:opacity-100"
        @choose="tree.act(item, $event)"
      />
    </div>
    <ConfirmDelete
      v-if="editing === 'delete'"
      :message="deleteMessage"
      @yes="tree.remove(item)"
      @no="tree.cancel()"
    />

    <ul v-if="open || namingIn === node.folder.id" class="ml-2.5 border-l border-[#1e2638] pl-1.5">
      <li v-if="namingIn === node.folder.id">
        <FolderForm
          :error="folderError"
          :saving="savingFolder"
          :where="node.folder.name"
          @submit="emit('createFolder', { name: $event, parentId: node.folder.id })"
        />
      </li>
      <FolderNode
        v-for="child in node.folders"
        :key="child.folder.id"
        :node="child"
        :naming-in="namingIn"
        :folder-error="folderError"
        :saving-folder="savingFolder"
        @create-folder="emit('createFolder', $event)"
      />
      <RequestRow v-for="request in node.requests" :key="request.id" :request="request" />
    </ul>
  </li>
</template>
