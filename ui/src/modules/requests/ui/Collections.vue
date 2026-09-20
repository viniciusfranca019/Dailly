<script setup lang="ts">
import type { Folder, SavedRequest } from '@dailly/requests-core'
import { computed, ref } from 'vue'
import FolderNode from './FolderNode.vue'
import { buildTree } from './tree.js'

/**
 * O aside direito: a coleção inteira, e as duas formas de acrescentar a ela.
 *
 * À direita e não à esquerda porque a navegação do shell já é uma barra à
 * esquerda, e duas barras coladas fazem a pessoa procurar em qual das duas
 * está o que ela quer. É o mesmo lugar que o Timeline ocupa no Daily Log.
 */
const props = defineProps<{
  folders: readonly Folder[]
  requests: readonly SavedRequest[]
  loading: boolean
  error: string | null
  selected: string | null
}>()

const emit = defineEmits<{
  pick: [request: SavedRequest]
  retry: []
  paste: []
  createFolder: [input: { name: string; parentId: string | null }]
}>()

const tree = computed(() => buildTree(props.folders, props.requests))
const empty = computed(
  () => !props.loading && props.error === null && props.folders.length === 0 && props.requests.length === 0,
)

const naming = ref(false)
const name = ref('')
const parentId = ref<string | null>(null)

function createFolder(): void {
  if (name.value.trim() === '') return
  emit('createFolder', { name: name.value.trim(), parentId: parentId.value })
  name.value = ''
  naming.value = false
}
</script>

<template>
  <aside
    class="flex min-h-0 w-full flex-col border-t border-[#1e2638] pt-4 xl:w-80 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
    data-testid="collections"
    aria-label="Coleções"
  >
    <div class="mb-3 flex items-center gap-2">
      <h2 class="flex-1 text-sm font-semibold text-gray-200">Coleções</h2>
      <button
        type="button"
        data-testid="new-folder"
        class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
        @click="naming = !naming"
      >
        Nova pasta
      </button>
      <button
        type="button"
        data-testid="new-request"
        class="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
        @click="emit('paste')"
      >
        Colar curl
      </button>
    </div>

    <form v-if="naming" class="mb-3 flex flex-col gap-2" @submit.prevent="createFolder">
      <input
        v-model="name"
        data-testid="folder-name"
        aria-label="Nome da pasta"
        placeholder="Nome da pasta"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 text-sm text-gray-200"
      />
      <select
        v-model="parentId"
        data-testid="folder-parent"
        aria-label="Dentro de"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 text-sm text-gray-200"
      >
        <option :value="null">na raiz</option>
        <option v-for="folder in folders" :key="folder.id" :value="folder.id">
          {{ folder.name }}
        </option>
      </select>
      <button
        type="submit"
        data-testid="save-folder"
        class="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
      >
        Criar
      </button>
    </form>

    <p v-if="loading" data-testid="collections-loading" class="px-2 text-sm text-[#747e8f]">
      lendo a coleção…
    </p>

    <p
      v-else-if="error"
      role="alert"
      data-testid="collections-error"
      class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
    >
      {{ error }}
      <button
        type="button"
        data-testid="collections-retry"
        class="mt-2 block rounded border border-red-400/30 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
        @click="emit('retry')"
      >
        tentar de novo
      </button>
    </p>

    <p v-else-if="empty" data-testid="collections-empty" class="px-2 text-sm leading-relaxed text-[#747e8f]">
      Nada guardado ainda. Cole um curl — do DevTools, da documentação de uma API — e ele
      vira uma request que dá para editar, salvar numa pasta e executar.
    </p>

    <ul v-else class="min-h-0 flex-1 overflow-y-auto">
      <FolderNode
        v-for="node in tree.folders"
        :key="node.folder.id"
        :node="node"
        :selected="selected"
        @pick="emit('pick', $event)"
      />
      <li v-for="request in tree.requests" :key="request.id">
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
    </ul>
  </aside>
</template>
