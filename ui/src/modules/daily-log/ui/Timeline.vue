<script setup lang="ts">
import type { Entry } from '@dailly/domain'
import { dayOf, type TimeZone } from '@dailly/periods'
import { computed, ref } from 'vue'
import TimelineEntry from './TimelineEntry.vue'
import { formatDay, groupByDay, titleOf } from './timeline.js'

const props = defineProps<{
  entries: readonly Entry[]
  zone: TimeZone
  now: string
  loading: boolean
}>()

const search = ref('')

/**
 * The search filters what is already on screen, and nothing more.
 *
 * Filtering in the store is Fase 2 — it needs the period and label filters the
 * roadmap puts there. This is the honest version of the box in the meantime:
 * it narrows the loaded entries, so what it promises is exactly what it does.
 */
const matching = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return props.entries
  return props.entries.filter((entry) => entry.body.toLowerCase().includes(needle))
})

const days = computed(() => groupByDay(matching.value, props.zone))

const today = computed(() => dayOf(props.now, props.zone))
const yesterday = computed(() => {
  const start = Date.parse(`${today.value}T12:00:00.000Z`) - 86_400_000
  return new Date(start).toISOString().slice(0, 10)
})

/** "Hoje, 16 de setembro de 2026" — the date, with today's name in front of it. */
function headingFor(day: string): string {
  if (day === today.value) return `Hoje, ${formatDay(day)}`
  if (day === yesterday.value) return `Ontem, ${formatDay(day)}`
  return formatDay(day)
}
</script>

<template>
  <section class="flex h-full flex-col" data-testid="timeline">
    <h2 class="text-lg font-semibold tracking-tight text-gray-100">Histórico de Logs</h2>

    <div class="mt-3 flex items-center gap-2">
      <div class="relative flex-1">
        <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#747e8f]">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" stroke-linecap="round" />
          </svg>
        </span>
        <input
          v-model="search"
          type="search"
          placeholder="Buscar logs…"
          data-testid="search"
          class="w-full rounded-md border border-[#1e2638] bg-[#121724] py-1.5 pl-8 pr-2 text-xs text-gray-200 placeholder:text-[#747e8f] focus:border-blue-600 focus:outline-none"
        />
      </div>
    </div>

    <div class="mt-4 flex-1 overflow-y-auto pr-1">
      <p v-if="props.loading" class="text-sm text-[#747e8f]" data-testid="timeline-status">
        carregando…
      </p>
      <p
        v-else-if="days.length === 0"
        class="text-sm text-[#747e8f]"
        data-testid="timeline-status"
      >
        {{ search ? 'nada encontrado para essa busca.' : 'nada por aqui ainda. escreva ao lado e registre.' }}
      </p>

      <section v-for="day in days" :key="day.day" class="mb-6" data-testid="day">
        <h3 class="mb-3 text-sm font-semibold text-gray-300" data-testid="day-heading">
          {{ headingFor(day.day) }}
        </h3>

        <!--
          The vertical rule belongs to the day, not to the list: it has to stop
          after a day's last entry so the next date reads as a break rather than
          as one unbroken thread.
        -->
        <ul class="relative ml-2.5 border-l-2 border-[#1e2638] pb-1">
          <TimelineEntry
            v-for="entry in day.entries"
            :key="entry.id"
            :entry="entry"
            :zone="props.zone"
            class="mb-4 last:mb-0"
          />
        </ul>
      </section>
    </div>
  </section>
</template>
