<script setup lang="ts">
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
import type { TimeZone } from '@dailly/periods'
import { CommentRequiredError, normalizeCommentBody, type TaskComment } from '@dailly/tasks-core'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { commentStamp } from '../../model/comment-stamp.js'
import CommentBody from './CommentBody.vue'

/**
 * The comments of the task in the panel (card #45, J8): the list, oldest
 * first, and the comment editor at the end, a second whiteboard whose
 * markdown is what is sent (RN14).
 *
 * After every send or delete the list is read again (RN7), and a refused send
 * keeps the text in the editor (C4). A list that comes back `null` means the
 * task is gone, which the panel shows as it does for a save (C6 of #22).
 */
export interface CommentsAccess {
  list(): Promise<readonly TaskComment[] | null>
  /** `null` when the task is gone; throws on a refusal. */
  add(body: string): Promise<TaskComment | null>
  remove(id: string): Promise<boolean>
}

const props = defineProps<{ access: CommentsAccess; zone: TimeZone }>()
const emit = defineEmits<{ gone: [] }>()

const comments = ref<readonly TaskComment[]>([])
const error = ref<string | null>(null)
const busy = ref(false)
/** The comment whose delete is waiting for a confirmation. */
const confirming = ref<string | null>(null)

const editorHost = ref<HTMLElement | null>(null)
const doc = shallowRef<WhiteboardDocument | null>(null)
let editor: WhiteboardHandle | null = null

function mountEditor(): void {
  editor?.destroy()
  if (!editorHost.value) return
  doc.value = new WhiteboardDocument('')
  editor = mountWhiteboard(editorHost.value, doc.value)
}

const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

async function load(): Promise<void> {
  try {
    const read = await props.access.list()
    if (read === null) emit('gone')
    else comments.value = read
  } catch (cause) {
    error.value = message(cause, 'não consegui ler os comentários')
  }
}

onMounted(() => {
  mountEditor()
  void load()
})
onBeforeUnmount(() => editor?.destroy())

async function send(): Promise<void> {
  if (busy.value) return
  let body: string
  try {
    body = normalizeCommentBody(doc.value?.toMarkdown() ?? '')
  } catch (cause) {
    // An empty comment is not sent, and there is nothing to explain (C2).
    if (cause instanceof CommentRequiredError) return
    throw cause
  }
  busy.value = true
  error.value = null
  try {
    const sent = await props.access.add(body)
    if (sent === null) emit('gone')
    else mountEditor()
  } catch (cause) {
    error.value = message(cause, 'não consegui enviar o comentário')
  } finally {
    busy.value = false
    await load()
  }
}

async function remove(id: string): Promise<void> {
  busy.value = true
  error.value = null
  try {
    await props.access.remove(id)
  } catch (cause) {
    error.value = message(cause, 'não consegui apagar o comentário')
  } finally {
    confirming.value = null
    busy.value = false
    await load()
  }
}

/** Ctrl+Enter sends, as in the Linear; Ctrl+S stays the task's save. */
function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void send()
  }
}
</script>

<template>
  <section aria-label="Comentários" class="flex flex-col gap-3 border-t border-[#1e2638] pt-4">
    <h2 class="text-sm font-medium text-gray-300">Comentários</h2>

    <ol v-if="comments.length > 0" class="flex flex-col gap-3">
      <li v-for="item in comments" :key="item.id" class="group rounded-md border border-[#1e2638] px-3 py-2">
        <div class="mb-1 flex items-center gap-2 text-xs text-[#747e8f]">
          <time :datetime="item.createdAt">{{ commentStamp(item.createdAt, zone) }}</time>
          <button
            type="button"
            aria-label="Apagar comentário"
            class="ml-auto rounded px-1 opacity-60 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
            @click="confirming = item.id"
          >
            ✕
          </button>
        </div>
        <CommentBody :body="item.body" />
        <div
          v-if="confirming === item.id"
          role="alertdialog"
          aria-label="Apagar comentário?"
          class="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs"
        >
          <p class="text-gray-200">Apagar este comentário? Não dá para desfazer.</p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              :disabled="busy"
              class="rounded-md bg-red-500 px-2 py-1 text-white disabled:opacity-50"
              @click="remove(item.id)"
            >
              Apagar comentário
            </button>
            <button type="button" class="px-2 py-1 text-gray-300" @click="confirming = null">Cancelar</button>
          </div>
        </div>
      </li>
    </ol>

    <div
      ref="editorHost"
      data-editor
      data-testid="comment-editor"
      class="min-h-16 rounded-md border border-[#1e2638] p-2"
      @keydown="onKeydown"
    />
    <p v-if="error" role="alert" class="text-xs text-red-300">{{ error }}</p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="busy"
        class="rounded-md bg-white/10 px-3 py-1 text-sm text-gray-100 hover:bg-white/15 disabled:opacity-50"
        @click="send"
      >
        Comentar
      </button>
      <span class="text-xs text-[#747e8f]">Ctrl+Enter</span>
    </div>
  </section>
</template>
