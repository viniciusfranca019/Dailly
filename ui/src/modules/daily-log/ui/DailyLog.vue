<script setup lang="ts">
import {
  EntryNotFoundError,
  findByName,
  nextColor,
  normalizeLabelName,
  normalizePropertyKey,
  parsePropertyValue,
  type Entry,
  type PropertyDef,
  type PropertyType,
  type PropertyValue,
  type Label,
  type LabelColor,
} from '@dailly/domain'
import type { SharedDeps } from '@shared'
import type { DailyLogDeps } from '../deps.js'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import Composer from './Composer.vue'
import Timeline from './Timeline.vue'
import LabelPicker from './LabelPicker.vue'
import LabelManager from './LabelManager.vue'
import PropertyEditor from './PropertyEditor.vue'
import FilterBar from './FilterBar.vue'
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
const propertyEditor = useTemplateRef<InstanceType<typeof PropertyEditor>>('propertyEditor')

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

/** The global labels (card #34), and the ones the entry on the board carries. */
const labels = ref<Label[]>([])
const chosen = ref<string[]>([])

/** The property definitions (card #35), and the values the entry on the board carries. */
const defs = ref<PropertyDef[]>([])
const values = ref<Record<string, PropertyValue>>({})

const sameProps = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value)

async function loadDefs(): Promise<void> {
  try {
    defs.value = await props.deps.properties.list()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui carregar as propriedades'
  }
}

/** A key defined on first use (C3), a value parsed by its type (C4); an empty key adds nothing (C5). */
async function addProp(rawKey: string, type: PropertyType, raw: string): Promise<void> {
  const key = normalizePropertyKey(rawKey)
  if (key === null) return
  const known = defs.value.find((def) => def.key === key)
  const parsed = parsePropertyValue(key, known?.type ?? type, raw)
  if ('error' in parsed) {
    error.value = parsed.error
    return
  }
  error.value = null
  if (!known) {
    try {
      await props.deps.properties.define(key, type)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'não consegui definir a propriedade'
      await loadDefs()
      return
    }
    await loadDefs()
  }
  values.value = { ...values.value, [key]: parsed.value }
  propertyEditor.value?.reset()
}

async function toggleFilterLabel(id: string): Promise<void> {
  filterLabels.value = filterLabels.value.includes(id)
    ? filterLabels.value.filter((x) => x !== id)
    : [...filterLabels.value, id]
  await load()
}

/** A property filter is read by its key's type, as an added property is. */
async function addFilterProp(key: string, raw: string): Promise<void> {
  const def = defs.value.find((d) => d.key === key)
  if (!def) return
  const parsed = parsePropertyValue(key, def.type, raw)
  if ('error' in parsed) {
    error.value = parsed.error
    return
  }
  filterProps.value = { ...filterProps.value, [key]: parsed.value }
  await load()
}

async function dropFilterProp(key: string): Promise<void> {
  const { [key]: _gone, ...rest } = filterProps.value
  filterProps.value = rest
  await load()
}

async function clearFilter(): Promise<void> {
  filterLabels.value = []
  filterProps.value = {}
  await load()
}

function dropProp(key: string): void {
  const { [key]: _gone, ...rest } = values.value
  values.value = rest
}

/** Back to a new entry: empty board, no labels, today. */
function startNew(): void {
  editing.value = null
  composer.value?.clear()
  chosen.value = []
  values.value = {}
  day.value = today.value
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/** Reread the labels; a failure here is shown, not thrown (RN7). */
async function loadLabels(): Promise<void> {
  try {
    labels.value = await props.deps.labels.list()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui carregar as labels'
  }
}

/** Run a label write, then reread labels and the timeline, whatever happened (RN7). */
async function labelWrite(write: () => Promise<unknown>): Promise<void> {
  let failure: string | null = null
  try {
    await write()
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : 'não consegui gravar a label'
  }
  await loadLabels()
  await load()
  if (failure) error.value = failure
}

/** An existing label whatever its case (C4), or a new one with the next palette color (C2). */
async function addLabel(name: string): Promise<void> {
  const normalized = normalizeLabelName(name)
  if (normalized === null) return
  const existing = findByName(labels.value, normalized)
  if (existing) {
    if (!chosen.value.includes(existing.id)) chosen.value = [...chosen.value, existing.id]
    return
  }
  error.value = null
  try {
    const created = await props.deps.labels.create({ name: normalized, color: nextColor(labels.value) })
    chosen.value = [...chosen.value, created.id]
    await loadLabels()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui criar a label'
    await loadLabels()
  }
}

function dropLabel(id: string): void {
  chosen.value = chosen.value.filter((x) => x !== id)
}

async function renameLabel(id: string, name: string): Promise<void> {
  const normalized = normalizeLabelName(name)
  if (normalized === null) {
    // Reread so the field shows the name the label still has.
    await loadLabels()
    error.value = 'o nome da label é obrigatório'
    return
  }
  await labelWrite(async () => {
    if ((await props.deps.labels.update(id, { name: normalized })) === null) throw new Error('label não encontrada')
  })
}

async function recolorLabel(id: string, color: LabelColor): Promise<void> {
  await labelWrite(async () => {
    if ((await props.deps.labels.update(id, { color })) === null) throw new Error('label não encontrada')
  })
}

async function removeLabel(id: string): Promise<void> {
  await labelWrite(async () => {
    await props.deps.labels.delete(id)
    // Only once it is gone (a refusal changes nothing, C10), and from the
    // entry being corrected too: the cascade took it off the stored one, so
    // the board must not count its absence as an unsaved change (C8).
    dropLabel(id)
    if (editing.value) {
      editing.value = { ...editing.value, labelIds: editing.value.labelIds.filter((x) => x !== id) }
    }
  })
}

/** Text on the board that is not saved anywhere: a new draft, or an edited correction. */
function dirty(): boolean {
  const board = composer.value?.markdown() ?? ''
  const text = board !== (editing.value?.body ?? '') && board.trim() !== ''
  return text || !sameSet(chosen.value, editing.value?.labelIds ?? []) || !sameProps(values.value, editing.value?.props ?? {})
}

/** "Cancelar edição" starts over; "Cancelar" on a new entry only empties it. */
function cancel(): void {
  if (editing.value) startNew()
  else {
    // The board and its labels, but not the day the person picked.
    composer.value?.clear()
    chosen.value = []
    values.value = {}
  }
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
  chosen.value = [...entry.labelIds]
  values.value = { ...(entry.props as Record<string, PropertyValue>) }
  composer.value?.load(entry.body)
}

/** A refusal that means the entry is gone: say so, start over, reread (RN7). */
async function lost(): Promise<void> {
  startNew()
  await load()
  // After the reload, which clears the error it starts with.
  error.value = new EntryNotFoundError().message
}

/** The timeline's cut (card #36): labels with OR, properties with AND (RN4). */
const filterLabels = ref<string[]>([])
const filterProps = ref<Record<string, PropertyValue>>({})
const filtered = computed(() => filterLabels.value.length > 0 || Object.keys(filterProps.value).length > 0)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    entries.value = await props.deps.queryEntries({
      ...(filterLabels.value.length > 0 ? { labelIds: filterLabels.value } : {}),
      ...(Object.keys(filterProps.value).length > 0 ? { props: filterProps.value } : {}),
    })
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
  if (sameDay && body === entry.body && sameSet(chosen.value, entry.labelIds) && sameProps(values.value, entry.props)) {
    startNew()
    return
  }
  await props.deps.updateEntry(entry.id, {
    body,
    ...(sameDay ? {} : { occurredAt: occurredAtFor(day.value, props.deps.now(), props.deps.zone) }),
    labelIds: chosen.value,
    props: values.value,
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
      else {
        // The timeline goes back to what the server has (RN7); the board keeps
        // the correction, to fix and retry (C5 of card #33).
        await load()
        error.value = cause instanceof Error ? cause.message : 'não consegui salvar'
      }
    } finally {
      saving.value = false
    }
    return
  }
  try {
    await props.deps.createEntry({
      body,
      occurredAt: occurredAtFor(day.value, props.deps.now(), props.deps.zone),
      labelIds: chosen.value,
      props: values.value,
    })
    composer.value?.clear()
    chosen.value = []
    values.value = {}
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

onMounted(async () => {
  await Promise.all([load(), loadLabels(), loadDefs()])
})
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
        <LabelPicker :labels="labels" :chosen="chosen" @add="addLabel" @remove="dropLabel" />
        <PropertyEditor ref="propertyEditor" :defs="defs" :values="values" @add="addProp" @remove="dropProp" />
        <p
          v-if="error"
          role="alert"
          data-testid="error"
          class="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ error }}
        </p>
        <LabelManager
          :labels="labels"
          @rename="renameLabel"
          @recolor="recolorLabel"
          @remove="removeLabel"
        />
      </div>

      <aside class="min-h-0 border-t border-[#1e2638] pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <FilterBar
          :labels="labels"
          :defs="defs"
          :label-ids="filterLabels"
          :values="filterProps"
          @toggle="toggleFilterLabel"
          @add-prop="addFilterProp"
          @drop-prop="dropFilterProp"
          @clear="clearFilter"
        />
        <Timeline
          :entries="entries"
          :zone="props.deps.zone"
          :now="now"
          :loading="loading"
          :editing-id="editing?.id ?? null"
          :labels="labels"
          :filtered="filtered"
          @clear="clearFilter"
          @open="open"
        />
      </aside>
    </div>
  </div>
</template>
