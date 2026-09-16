<script setup lang="ts">
import type { Entry } from '@dailly/domain'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
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

const PLACEHOLDER = '# Hoje\n[] primeira entrada'

const boardHost = ref<HTMLElement | null>(null)
const board = shallowRef<WhiteboardHandle | null>(null)
const doc = shallowRef<WhiteboardDocument | null>(null)

const entries = ref<Entry[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const days = computed(() => groupByDay(entries.value, props.deps.zone))

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
    // truth and the adapter re-renders from it.
    doc.value?.setMarkdown('')
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui salvar a entrada'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  const host = boardHost.value
  if (!host) return
  doc.value = new WhiteboardDocument(PLACEHOLDER)
  board.value = mountWhiteboard(host, doc.value)
  void load()
})

onBeforeUnmount(() => {
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
      <!-- Owned by the whiteboard adapter. Vue renders nothing in here. -->
      <div ref="boardHost" class="whiteboard"></div>
      <button type="button" class="daily-log__save" :disabled="saving" @click="save">
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
