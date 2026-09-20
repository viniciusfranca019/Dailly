<script setup lang="ts">
import type { SavedRequest } from '@dailly/requests-core'
import type { TreeFolder } from './tree.js'

/**
 * Um galho da árvore — recursivo, porque a árvore é.
 *
 * Componente separado e não um `v-for` aninhado no pai: profundidade é
 * arbitrária, e a única forma honesta de desenhar profundidade arbitrária é
 * um componente que se chama.
 */
defineProps<{ node: TreeFolder; selected: string | null }>()
const emit = defineEmits<{ pick: [request: SavedRequest] }>()
</script>

<template>
  <li>
    <div
      class="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#747e8f]"
      data-testid="folder"
      :data-folder-id="node.folder.id"
    >
      {{ node.folder.name }}
    </div>

    <ul class="border-l border-[#1e2638] pl-2">
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
        @pick="emit('pick', $event)"
      />
    </ul>
  </li>
</template>
