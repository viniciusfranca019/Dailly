<script setup lang="ts">
import type { Entry } from '@dailly/domain'
import { timeOf, type TimeZone } from '@dailly/periods'
import { computed } from 'vue'
import { titleOf } from './timeline.js'

const props = defineProps<{ entry: Entry; zone: TimeZone }>()

const time = computed(() => timeOf(props.entry.occurredAt, props.zone))
</script>

<template>
  <li class="relative pl-8" data-testid="entry">
    <!--
      The node on the line. `ring` and not `border`: with `box-border` — which
      is the default here — a 10px box with a 4px border leaves 2px of blue in
      the middle, and the node reads as a speck. A ring is drawn outside the box
      and takes no layout, which is exactly what punching a hole in the vertical
      rule needs.
    -->
    <span
      class="absolute left-1 top-1.5 z-10 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-[#0c101b]"
    ></span>

    <p class="text-xs text-[#747e8f]" data-testid="entry-time">{{ time }}</p>

    <div class="mt-1 rounded-lg border border-[#1e2638] bg-[#121724] px-3 py-2">
      <p class="text-sm font-medium text-gray-200" data-testid="entry-title">
        {{ titleOf(props.entry.body) }}
      </p>

      <!--
        Labels are Fase 2 of the roadmap: `labelIds` is always empty today, so
        this row renders for nobody. It is here rather than invented because the
        shape is decided (ADR 0002) and seeding fake tags would make a screenshot
        that promises something the product cannot do.
      -->
      <ul v-if="props.entry.labelIds.length > 0" class="mt-1.5 flex flex-wrap gap-1">
        <li
          v-for="label in props.entry.labelIds"
          :key="label"
          class="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400"
        >
          {{ label }}
        </li>
      </ul>
    </div>
  </li>
</template>
