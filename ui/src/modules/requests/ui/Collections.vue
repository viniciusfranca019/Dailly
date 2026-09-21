<script setup lang="ts">
import type { Folder, SavedRequest } from '@dailly/requests-core'
import { computed, ref, watch } from 'vue'
import AddMenu from './AddMenu.vue'
import FolderForm from './FolderForm.vue'
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
  /** A recusa da última tentativa de criar pasta, mostrada onde ela foi feita. */
  folderError: string | null
  /**
   * Sobe a cada pasta criada com sucesso.
   *
   * O formulário não pode se limpar no clique: o pai é assíncrono e a recusa
   * só chega depois, então limpar ali apagava o nome digitado **antes** de
   * saber se tinha dado certo — e para tentar de novo era preciso redigitar.
   * Um contador é o sinal mais fino possível de "deu certo", e não obriga o
   * pai a devolver promessa por um `emit`.
   */
  folderSaved: number
  /** Uma criação em voo — o botão não pode disparar a segunda. */
  savingFolder: boolean
}>()

const emit = defineEmits<{
  pick: [request: SavedRequest]
  retry: []
  newRequest: [parentId: string | null]
  createFolder: [input: { name: string; parentId: string | null }]
  clearFolderError: []
}>()

const tree = computed(() => buildTree(props.folders, props.requests))
const empty = computed(
  () => !props.loading && props.folders.length === 0 && props.requests.length === 0,
)

/**
 * Onde a pasta nova vai nascer — vem do `+` que foi clicado, não de um campo.
 *
 * `undefined` quer dizer que ninguém pediu pasta nenhuma. O select de
 * "dentro de" saiu com isto: perguntar de novo seria duas verdades para a
 * mesma coisa, e era assim que a pasta-mãe de uma tentativa sobrevivia para a
 * seguinte.
 */
const namingIn = ref<string | null | undefined>(undefined)

function startFolder(parentId: string | null): void {
  namingIn.value = parentId
  emit('clearFolderError')
}

/**
 * Pedir uma request nova fecha o formulário de pasta.
 *
 * Senão ele fica aberto atrás, e o próximo Criar cria a pasta que a pessoa já
 * tinha desistido de criar.
 */
function startRequest(parentId: string | null): void {
  namingIn.value = undefined
  emit('newRequest', parentId)
}



watch(
  () => props.folderSaved,
  // Some o "onde": o formulário é desmontado, e com ele o nome digitado. O
  // próximo `+` traz os dois de volta, do lugar certo.
  () => (namingIn.value = undefined),
)
</script>

<template>
  <aside
    class="flex min-h-0 w-full flex-col border-t border-[#1e2638] pt-4 xl:w-80 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
    data-testid="collections"
    aria-label="Coleções"
  >
    <div class="mb-3 flex items-center gap-2">
      <h2 class="flex-1 text-sm font-semibold text-gray-200">Coleções</h2>
      <AddMenu
        :parent-id="null"
        where="Coleções"
        testid="add-root"
        @new-request="startRequest($event)"
        @new-folder="startFolder($event)"
      />
    </div>

    <!-- Só a raiz mora aqui; o de cada pasta é desenhado dentro dela. -->
    <FolderForm
      v-if="namingIn === null"
      :error="folderError"
      :saving="savingFolder"
      where="Coleções"
      @submit="emit('createFolder', { name: $event, parentId: null })"
    />

    <p v-if="loading" data-testid="collections-loading" class="px-2 text-sm text-[#747e8f]">
      lendo a coleção…
    </p>

    <!--
      O erro de uma **releitura** é aviso, não apagador: trocar a árvore certa
      pelo banner tira da tela dado bom que já estava lá, e contraria o mesmo
      raciocínio que fez o `loading` parar de marcar toda releitura.
    -->
    <p
      v-if="error"
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

    <p v-else-if="empty && error === null" data-testid="collections-empty" class="px-2 text-sm leading-relaxed text-[#747e8f]">
      Nada guardado ainda. Cole um curl — do DevTools, da documentação de uma API — e ele
      vira uma request que dá para editar, salvar numa pasta e executar.
    </p>

    <ul v-if="!loading && !empty" class="min-h-0 flex-1 overflow-y-auto">
      <FolderNode
        v-for="node in tree.folders"
        :key="node.folder.id"
        :node="node"
        :selected="selected"
        :naming-in="namingIn"
        :folder-error="folderError"
        :saving-folder="savingFolder"
        @pick="emit('pick', $event)"
        @new-request="startRequest($event)"
        @new-folder="startFolder($event)"
        @create-folder="emit('createFolder', $event)"
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
