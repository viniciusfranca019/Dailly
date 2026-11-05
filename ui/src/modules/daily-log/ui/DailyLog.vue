<script setup lang="ts">
import { EntryNotFoundError, type Entry } from '@dailly/domain'
import type { SharedDeps } from '@shared'
import type { DailyLogDeps } from '../deps.js'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import Composer from './Composer.vue'
import Timeline from './Timeline.vue'
import { formatDay } from '../model/timeline.js'
import { occurredAtFor } from '../model/entry-date.js'
import { dayOf, type CalendarDay } from '@dailly/periods'

/**
 * The Daily Log: write on the left, read on the right.
 *
 * It owns the state and the two calls into the domain, and nothing else — the
 * editor card and the timeline are components because they are two screens'
 * worth of markup and they change for different reasons.
 */
const props = defineProps<{ deps: SharedDeps & DailyLogDeps }>()

const composer = useTemplateRef<InstanceType<typeof Composer>>('composer')

const entries = ref<Entry[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const now = ref(props.deps.now())

/** Today, in the configured zone — the default day and the ceiling for the picker. */
const today = computed(() => dayOf(now.value, props.deps.zone))
const day = ref<CalendarDay>(today.value)

/**
 * The entry being corrected, or `null` while writing a new one (card #33).
 * The same composer does both: it already holds the whiteboard, and a second
 * editor on screen would be two places to type with one Ctrl+S.
 */
const editing = ref<Entry | null>(null)

const title = computed(() =>
  editing.value ? 'Corrigir registro' : `Registro do Dia — ${formatDay(today.value)}`,
)

/** Back to a new entry: empty board, today. */
function startNew(): void {
  editing.value = null
  composer.value?.clear()
  day.value = today.value
}

/** Text on the board that is not saved anywhere: a new draft, or an edited correction. */
function dirty(): boolean {
  const board = composer.value?.markdown() ?? ''
  return board !== (editing.value?.body ?? '') && board.trim() !== ''
}

/** "Cancelar edição" starts over; "Cancelar" on a new entry only empties it. */
function cancel(): void {
  if (editing.value) startNew()
  else composer.value?.clear()
}

function open(entry: Entry): void {
  // Never replace unsaved writing behind the person's back.
  if (dirty()) {
    error.value = 'salve ou cancele o que está no editor antes de abrir outro registro'
    return
  }
  error.value = null
  editing.value = entry
  day.value = dayOf(entry.occurredAt, props.deps.zone)
  composer.value?.load(entry.body)
}

/** A refusal that means the entry is gone: say so, start over, reread (RN7). */
async function lost(): Promise<void> {
  startNew()
  await load()
  // After the reload, which clears the error it starts with.
  error.value = new EntryNotFoundError().message
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

async function correct(entry: Entry, body: string): Promise<void> {
  // The instant moves only if the day did (RN5): opening and saving keeps the
  // hour the entry already had.
  const sameDay = day.value === dayOf(entry.occurredAt, props.deps.zone)
  // Opening and saving without a change is a no-op: no request, no phantom
  // `updatedAt`. The board is canonical, like the stored body.
  if (sameDay && body === entry.body) {
    startNew()
    return
  }
  await props.deps.updateEntry(entry.id, {
    body,
    ...(sameDay ? {} : { occurredAt: occurredAtFor(day.value, props.deps.now(), props.deps.zone) }),
  })
  startNew()
  await load()
}

async function remove(): Promise<void> {
  const entry = editing.value
  if (!entry) return
  saving.value = true
  error.value = null
  try {
    await props.deps.deleteEntry(entry.id)
    startNew()
    await load()
  } catch (cause) {
    if (cause instanceof EntryNotFoundError) await lost()
    else error.value = cause instanceof Error ? cause.message : 'não consegui apagar'
  } finally {
    saving.value = false
  }
}

async function save(body: string): Promise<void> {
  saving.value = true
  error.value = null
  const entry = editing.value
  if (entry) {
    try {
      await correct(entry, body)
    } catch (cause) {
      // On any other failure the correction stays on the board (C5).
      if (cause instanceof EntryNotFoundError) await lost()
      else error.value = cause instanceof Error ? cause.message : 'não consegui salvar'
    } finally {
      saving.value = false
    }
    return
  }
  try {
    await props.deps.createEntry({
      body,
      occurredAt: occurredAtFor(day.value, props.deps.now(), props.deps.zone),
    })
    composer.value?.clear()
    now.value = props.deps.now()
    // Back to today after a successful register. The badge makes backdating
    // visible, but a badge is a mitigation and not a control: the next entry
    // quietly landing on last Tuesday is the failure that loses writing to the
    // wrong day, and re-picking costs one click. On a failure the choice stays,
    // because the person is about to try again.
    day.value = today.value
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui registrar'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="daily-log">
    <nav class="flex items-center gap-2 px-6 py-4 text-sm text-[#747e8f]">
      <span>Diários</span>
      <span class="text-[#1e2638]">/</span>
      <span class="text-gray-300">{{ editing ? 'Corrigir Registro' : 'Novo Registro' }}</span>
    </nav>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_384px]">
      <div class="flex min-h-0 flex-col">
        <Composer
          ref="composer"
          v-model:day="day"
          :title="title"
          :saving="saving"
          :max-day="today"
          :editing="editing !== null"
          @submit="save"
          @cancel="cancel"
          @remove="remove"
        />
        <p
          v-if="error"
          role="alert"
          data-testid="error"
          class="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ error }}
        </p>
      </div>

      <aside class="min-h-0 border-t border-[#1e2638] pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <Timeline
          :entries="entries"
          :zone="props.deps.zone"
          :now="now"
          :loading="loading"
          :editing-id="editing?.id ?? null"
          @open="open"
        />
      </aside>
    </div>
  </div>
</template>
