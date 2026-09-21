<script setup lang="ts">
import type { SavedRequest } from '@dailly/requests-core'
import AddMenu from './AddMenu.vue'
import FolderForm from './FolderForm.vue'
import type { TreeFolder } from './tree.js'

/**
 * Um galho da árvore — recursivo, porque a árvore é.
 *
 * Componente separado e não um `v-for` aninhado no pai: profundidade é
 * arbitrária, e a única forma honesta de desenhar profundidade arbitrária é
 * um componente que se chama.
 */
defineProps<{
  node: TreeFolder
  selected: string | null
  /** A pasta cujo formulário de nome está aberto — `undefined` é nenhum. */
  namingIn: string | null | undefined
  folderError: string | null
  savingFolder: boolean
}>()
const emit = defineEmits<{
  pick: [request: SavedRequest]
  newRequest: [parentId: string | null]
  newFolder: [parentId: string | null]
  createFolder: [input: { name: string; parentId: string | null }]
}>()
</script>

<template>
  <li>
    <div class="flex items-center gap-1 px-2 py-1">
      <span
        class="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-[#747e8f]"
        data-testid="folder"
        :data-folder-id="node.folder.id"
      >
        {{ node.folder.name }}
      </span>
      <AddMenu
        :parent-id="node.folder.id"
        :where="node.folder.name"
        testid="add-in-folder"
        @new-request="emit('newRequest', $event)"
        @new-folder="emit('newFolder', $event)"
      />
    </div>

    <ul class="border-l border-[#1e2638] pl-2">
      <li v-if="namingIn === node.folder.id">
        <FolderForm
          :error="folderError"
          :saving="savingFolder"
          :where="node.folder.name"
          @submit="emit('createFolder', { name: $event, parentId: node.folder.id })"
        />
      </li>

      <li v-for="request in node.requests" :key="request.id">
        <button
          type="button"
          data-testid="request"
          :data-request-id="request.id"
          :aria-current="request.id === selected ? 'true' : undefined"
          class="w-full truncate rounded px-2 py-1 text-left text-sm transition-colors hover:bg-white/5"
          :class="request.id === selected ? 'bg-white/5 text-gray-100' : 'text-gray-400'"
          @click="emit('pick', request)"
        >
          {{ request.name }}
        </button>
      </li>

      <FolderNode
        v-for="child in node.folders"
        :key="child.folder.id"
        :node="child"
        :selected="selected"
        :naming-in="namingIn"
        :folder-error="folderError"
        :saving-folder="savingFolder"
        @pick="emit('pick', $event)"
        @new-request="emit('newRequest', $event)"
        @new-folder="emit('newFolder', $event)"
        @create-folder="emit('createFolder', $event)"
      />
    </ul>
  </li>
</template>
