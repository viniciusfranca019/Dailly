<script setup lang="ts">
import type { Folder, SavedRequest } from '@dailly/requests-core'
import { computed, ref, watch } from 'vue'
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
  paste: []
  createFolder: [input: { name: string; parentId: string | null }]
  clearFolderError: []
}>()

const tree = computed(() => buildTree(props.folders, props.requests))
const empty = computed(
  () => !props.loading && props.folders.length === 0 && props.requests.length === 0,
)

const naming = ref(false)
const name = ref('')
const parentId = ref<string | null>(null)

function createFolder(): void {
  // O `:disabled` do botão é a barreira de quem usa; a guarda de verdade mora
  // no pai, que é quem tem a operação em voo. Duplicar aqui dava duas mecânicas
  // para a mesma coisa — e a que o teste mata não seria a que trabalha.
  if (name.value.trim() === '') return
  emit('createFolder', { name: name.value.trim(), parentId: parentId.value })
}

/**
 * Reabrir o formulário é uma tentativa nova, e uma tentativa nova não começa
 * acusada. Sem isto a recusa da vez passada reaparecia junto com o formulário
 * vazio, culpando algo que ainda não aconteceu.
 */
function toggleNaming(): void {
  naming.value = !naming.value
  emit('clearFolderError')
}

watch(
  () => props.folderSaved,
  () => {
    name.value = ''
    // `parentId` também: sem isto a pasta-mãe da tentativa anterior ficava
    // escolhida na próxima, e a próxima pasta nascia num lugar que ninguém
    // pediu.
    parentId.value = null
    naming.value = false
  },
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
      <button
        type="button"
        data-testid="new-folder"
        :aria-expanded="naming"
        aria-controls="requests-folder-form"
        class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
        @click="toggleNaming"
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

    <form
      v-if="naming"
      id="requests-folder-form"
      class="mb-3 flex flex-col gap-2"
      @submit.prevent="createFolder"
    >
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
      <p
        v-if="folderError"
        role="alert"
        data-testid="folder-error"
        class="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300"
      >
        {{ folderError }}
      </p>
      <button
        type="submit"
        data-testid="save-folder"
        :disabled="savingFolder"
        class="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        Criar
      </button>
    </form>

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
