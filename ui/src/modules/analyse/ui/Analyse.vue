<script setup lang="ts">
import type { ModuleDeps } from '@shared'

/**
 * Analyse — the screen behind the flag.
 *
 * It renders nothing operable on purpose. A disabled button or an empty chart
 * would invite a click and a bug report; a sentence saying what is missing is
 * the honest version of the same screen.
 *
 * `deps` is declared and unused, and that is deliberate: every module is
 * rendered by the shell with the same single prop, so the contract is uniform
 * and this file needs no special case in `Shell.vue` the day it grows a body.
 */
defineProps<{ deps: ModuleDeps }>()
</script>

<template>
  <section class="mx-auto max-w-2xl px-8 py-10" data-testid="analyse">
    <h1 class="text-lg font-semibold tracking-tight text-gray-100">Analyse</h1>
    <p class="mt-3 text-sm leading-relaxed text-[#747e8f]">
      Fase 4/5 do roadmap. Ainda não construída.
    </p>
    <p class="mt-2 text-sm leading-relaxed text-[#747e8f]">
      Depende de <strong class="font-medium text-gray-300">Entry com labels</strong>, que
      chega na Fase 2, e do
      <strong class="font-medium text-gray-300">provider BYOK</strong>, que chega na
      Fase 3.
    </p>
  </section>
</template>
