<script setup lang="ts">
import type { Folder, SavedRequest } from '@dailly/requests-core'
import { computed, provide, ref, toRef, useTemplateRef, watch } from 'vue'
import FolderForm from './FolderForm.vue'
import FolderNode from './FolderNode.vue'
import ItemMenu from './ItemMenu.vue'
import RequestRow from './RequestRow.vue'
import { useOpenFolders } from './open-folders.js'
import { type Action, type Editing, type Item, TREE, type TreeContext, actionsFor } from './tree-context.js'
import { type Dragged, buildTree, canDrop, endPosition } from './tree.js'

/**
 * O aside direito: a coleção inteira, e o que dá para fazer com ela.
 *
 * À direita e não à esquerda porque a navegação do shell já é uma barra à
 * esquerda, e duas barras coladas fazem a pessoa procurar em qual das duas
 * está o que ela quer. É o mesmo lugar que o Timeline ocupa no Daily Log.
 *
 * A árvore é a do Apidog: pastas que abrem e fecham com a contagem, o método
 * colorido, o `⋯` e o clique direito em cada nível, arrastar entre pastas,
 * renomear e apagar. Este componente é o dono do estado da árvore (o que está
 * aberto, o que está sendo arrastado, o que está sendo renomeado) e o entrega
 * às linhas por `provide`; o que muda dado sobe para a tela por emit.
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
  /** A recusa da última mudança na árvore: mover, renomear, apagar. */
  treeError: string | null
  /** Sobe a cada mudança na árvore que deu certo — o mesmo sinal do `folderSaved`. */
  treeSaved: number
}>()

const emit = defineEmits<{
  pick: [request: SavedRequest]
  retry: []
  newRequest: [parentId: string | null]
  createFolder: [input: { name: string; parentId: string | null }]
  clearFolderError: []
  move: [input: { dragged: Dragged; target: string | null; position: number }]
  rename: [input: { target: Item; name: string }]
  remove: [target: Item]
  clearTreeError: []
}>()

const tree = computed(() => buildTree(props.folders, props.requests))

const empty = computed(
  () => !props.loading && props.folders.length === 0 && props.requests.length === 0,
)

/**
 * Onde a pasta nova vai nascer — vem do `⋯` que foi aberto, não de um campo.
 *
 * `undefined` quer dizer que ninguém pediu pasta nenhuma. O select de
 * "dentro de" saiu com isto: perguntar de novo seria duas verdades para a
 * mesma coisa, e era assim que a pasta-mãe de uma tentativa sobrevivia para a
 * seguinte.
 */
const namingIn = ref<string | null | undefined>(undefined)

const openFolders = useOpenFolders()

/** As pastas acima de `folderId`, ela incluída — para abrir o caminho até um item. */
function pathTo(folderId: string | null): string[] {
  const byId = new Map(props.folders.map((folder) => [folder.id, folder]))
  const path: string[] = []
  const seen = new Set<string>()
  let cursor = folderId === null ? undefined : byId.get(folderId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    path.push(cursor.id)
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId)
  }
  return path
}

/**
 * A request aberta no editor fica sempre à vista.
 *
 * Com as pastas começando fechadas, salvar uma request dentro de uma pasta a
 * deixaria escondida — a pessoa salva e "some". Abrir o caminho até ela é o
 * que o Apidog faz ao selecionar, e não fecha nada que a pessoa abriu.
 */
watch(
  () => [props.selected, props.requests] as const,
  ([selected]) => {
    const request = props.requests.find((candidate) => candidate.id === selected)
    if (request) openFolders.reveal(pathTo(request.folderId))
  },
  { immediate: true },
)

function startFolder(parentId: string | null): void {
  namingIn.value = parentId
  // O formulário mora dentro da pasta: fechada, ele nasceria invisível.
  openFolders.reveal(pathTo(parentId))
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
  // próximo `⋯` traz os dois de volta, do lugar certo.
  () => (namingIn.value = undefined),
)

const editing = ref<Editing | null>(null)

// Deu certo: o renomear ou a confirmação fecham. Deu errado: ficam abertos,
// com a recusa ao lado, para corrigir sem reabrir o menu.
watch(
  () => props.treeSaved,
  () => (editing.value = null),
)

const dragging = ref<Dragged | null>(null)

const context: TreeContext = {
  selected: toRef(props, 'selected'),
  isOpen: openFolders.isOpen,
  toggle: openFolders.toggle,

  dragging,
  startDrag(dragged) {
    dragging.value = dragged
    emit('clearTreeError')
  },
  endDrag() {
    dragging.value = null
  },
  canDropOn(target) {
    return dragging.value !== null && canDrop(props.folders, dragging.value, target)
  },
  dropOn(target) {
    const dragged = dragging.value
    dragging.value = null
    if (dragged === null || !canDrop(props.folders, dragged, target)) return
    emit('move', { dragged, target, position: endPosition(tree.value, target, dragged.kind) })
  },

  editing,
  renameError: toRef(props, 'treeError'),
  act(target, action: Action) {
    emit('clearTreeError')
    const parentId = target?.kind === 'folder' ? target.item.id : null
    if (action === 'new-request') startRequest(parentId)
    else if (action === 'new-folder') startFolder(parentId)
    else if (target !== null) editing.value = { mode: action, target }
  },
  rename(target, name) {
    if (name === target.item.name) {
      editing.value = null
      return
    }
    emit('rename', { target, name })
  },
  remove(target) {
    emit('remove', target)
  },
  cancel() {
    editing.value = null
    emit('clearTreeError')
  },

  pick(request) {
    emit('pick', request)
  },
}

provide(TREE, context)

const rootMenu = useTemplateRef<InstanceType<typeof ItemMenu>>('rootMenu')
const overRoot = ref(false)

function onRootDragOver(event: DragEvent): void {
  overRoot.value = context.canDropOn(null)
  if (overRoot.value) event.preventDefault()
}

function onRootDrop(event: DragEvent): void {
  overRoot.value = false
  if (!context.canDropOn(null)) return
  event.preventDefault()
  context.dropOn(null)
}
</script>

<template>
  <aside
    class="flex min-h-0 w-full flex-col rounded border-t border-[#1e2638] pt-4 xl:w-80 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
    :class="{ 'bg-blue-500/5 ring-1 ring-blue-500/30': overRoot }"
    data-testid="collections"
    aria-label="Coleções"
    @contextmenu.prevent="rootMenu?.openAt($event.clientX, $event.clientY)"
    @dragover="onRootDragOver"
    @dragleave.self="overRoot = false"
    @drop="onRootDrop"
  >
    <div class="mb-3 flex items-center gap-2">
      <h2 class="flex-1 text-sm font-semibold text-gray-200">Coleções</h2>
      <ItemMenu
        ref="rootMenu"
        :actions="actionsFor(null)"
        where="Coleções"
        testid="add-root"
        @choose="context.act(null, $event)"
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

    <p
      v-if="treeError && editing?.mode !== 'rename'"
      role="alert"
      data-testid="tree-error"
      class="mb-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
    >
      {{ treeError }}
    </p>

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
        :naming-in="namingIn"
        :folder-error="folderError"
        :saving-folder="savingFolder"
        @create-folder="emit('createFolder', $event)"
      />
      <RequestRow v-for="request in tree.requests" :key="request.id" :request="request" />
    </ul>
  </aside>
</template>
