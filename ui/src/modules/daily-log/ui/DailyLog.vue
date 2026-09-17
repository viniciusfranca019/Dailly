<script setup lang="ts">
import type { Entry } from '@dailly/domain'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { TEXT_ATTR, mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
import type { ModuleDeps } from '@shared'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { formatDay, groupByDay, titleOf } from './timeline.js'

/**
 * The Daily Log: write an entry above, read the timeline below.
 *
 * **The editor is an island.** `mountWhiteboard` owns the DOM inside
 * `boardHost`, and Vue must never render into it — the element is empty in the
 * template for exactly that reason. ADR 0010 chose this over a Vue-native
 * editor because the whiteboard leans on `contenteditable` behaviour and a
 * vdom reconciling the node under the caret fights it.
 */
const props = defineProps<{ deps: ModuleDeps }>()

/**
 * The composer starts **empty**, not with a sample entry.
 *
 * It used to open with `# Hoje / [] primeira entrada`, and that is content: a
 * click on "salvar" without typing anything would have persisted a diary entry
 * the person never wrote. An empty document is never truly empty — the core
 * guarantees one paragraph to put the caret in — so there is always somewhere
 * to type.
 */
const boardHost = ref<HTMLElement | null>(null)
const board = shallowRef<WhiteboardHandle | null>(null)
const doc = shallowRef<WhiteboardDocument | null>(null)

const entries = ref<Entry[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
/** Tracked so "salvar" is unavailable rather than failing with "corpo obrigatório". */
const empty = ref(true)

const days = computed(() => groupByDay(entries.value, props.deps.zone))

/**
 * Clicking the composer's empty space puts the caret in the editor.
 *
 * Without this, only the 24px line of the block itself is a target, and the
 * padding around it is dead: the person clicks inside the box, nothing happens,
 * and the app looks broken. Every editor behaves this way — the writing area is
 * the box, not the line.
 *
 * Clicks that land on a block are left alone, so the adapter still owns caret
 * placement within the text.
 */
function focusEditor(event: MouseEvent): void {
  if (event.target !== event.currentTarget) return
  const blocks = boardHost.value?.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)
  blocks?.[blocks.length - 1]?.focus()
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    entries.value = await props.deps.queryEntries()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui carregar a timeline'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  const body = doc.value?.toMarkdown() ?? ''
  saving.value = true
  error.value = null
  try {
    await props.deps.createEntry({ body })
    // Clearing through the document, not the DOM: the model is the source of
    // truth, the adapter re-renders from its subscription, and `#commit`
    // guarantees the emptied document still has one paragraph to type into.
    doc.value?.setMarkdown('')
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui salvar a entrada'
  } finally {
    saving.value = false
  }
}

let unsubscribe: (() => void) | undefined

onMounted(() => {
  const host = boardHost.value
  if (!host) return
  const store = new WhiteboardDocument('')
  doc.value = store
  board.value = mountWhiteboard(host, store)
  // Vue reacts to the island through the island's own contract: the document
  // notifies on every mutation, and that is the only channel between them.
  unsubscribe = store.subscribe(() => {
    empty.value = store.toMarkdown().trim() === ''
  })
  void load()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  board.value?.destroy()
  board.value = null
})
</script>

<template>
  <section class="daily-log">
    <header class="daily-log__header">
      <h1>Daily Log</h1>
      <!--
        ADR 0007 requires this to be visible always, not tucked into Settings:
        every calendar boundary in the product is built on it, so hiding it
        hides the reason a day looks the way it does.
      -->
      <span class="daily-log__zone" :title="'Fuso em uso pela API local'">
        fuso: {{ deps.zone }}
      </span>
    </header>

    <div class="daily-log__composer">
      <!--
        Owned by the whiteboard adapter. Vue renders nothing in here — the click
        handler only redirects focus, it never touches the contents.
      -->
      <div ref="boardHost" class="whiteboard" @click="focusEditor"></div>
      <button type="button" class="daily-log__save" :disabled="saving || empty" @click="save">
        {{ saving ? 'salvando…' : 'salvar entrada' }}
      </button>
    </div>

    <p v-if="error" class="daily-log__error" role="alert">{{ error }}</p>

    <section class="daily-log__timeline">
      <p v-if="loading" class="daily-log__status">carregando…</p>
      <p v-else-if="days.length === 0" class="daily-log__status">
        nada por aqui ainda. escreva acima e salve.
      </p>
      <article v-for="day in days" :key="day.day" class="daily-log__day">
        <h2>{{ formatDay(day.day) }}</h2>
        <ul>
          <li v-for="entry in day.entries" :key="entry.id" class="daily-log__entry">
            {{ titleOf(entry.body) }}
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
