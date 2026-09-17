<script setup lang="ts">
import type { Entry } from '@dailly/domain'
import type { ModuleDeps } from '@shared'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import Composer from './Composer.vue'
import Timeline from './Timeline.vue'
import { formatDay } from './timeline.js'
import { occurredAtFor } from './entry-date.js'
import { dayOf, type CalendarDay } from '@dailly/periods'

/**
 * The Daily Log: write on the left, read on the right.
 *
 * It owns the state and the two calls into the domain, and nothing else — the
 * editor card and the timeline are components because they are two screens'
 * worth of markup and they change for different reasons.
 */
const props = defineProps<{ deps: ModuleDeps }>()

const composer = useTemplateRef<InstanceType<typeof Composer>>('composer')

const entries = ref<Entry[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const now = ref(props.deps.now())

/** Today, in the configured zone — the default day and the ceiling for the picker. */
const today = computed(() => dayOf(now.value, props.deps.zone))
const day = ref<CalendarDay>(today.value)

const title = computed(() => `Registro do Dia — ${formatDay(today.value)}`)

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

async function save(body: string): Promise<void> {
  saving.value = true
  error.value = null
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
      <span class="text-gray-300">Novo Registro</span>
    </nav>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_384px]">
      <div class="flex min-h-0 flex-col">
        <Composer
          ref="composer"
          v-model:day="day"
          :title="title"
          :saving="saving"
          :max-day="today"
          @submit="save"
          @cancel="composer?.clear()"
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
        <Timeline :entries="entries" :zone="props.deps.zone" :now="now" :loading="loading" />
      </aside>
    </div>
  </div>
</template>
