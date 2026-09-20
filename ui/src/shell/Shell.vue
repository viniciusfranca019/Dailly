<script setup lang="ts">
import type { Component } from 'vue'
import type { ModuleDeps, ModuleDescriptor, VueModule } from '@shared'

/**
 * The frame: sidebar, navigation, zone, and the outlet the current module
 * renders into.
 *
 * Presentational on purpose. It owns no route and loads no module — it is
 * handed what to show and reports what was clicked, which is what keeps the
 * routing state in `mount.ts` where `ShellHandle` can expose it without
 * `defineExpose` gymnastics.
 */
defineProps<{
  modules: readonly ModuleDescriptor<VueModule>[]
  deps: ModuleDeps
  /** Route currently on screen; drives the active mark on the navigation. */
  current: string
  /** The module to render, or `null` before the first one has loaded. */
  component: Component | null
}>()

const emit = defineEmits<{ navigate: [route: string] }>()
</script>

<template>
  <div class="flex h-full min-h-0">
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-[#1e2638] bg-[#0a0d16] px-3 py-4"
      data-testid="sidebar"
    >
      <header
        class="mb-5 flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-gray-100"
      >
        <span
          class="grid h-5 w-5 place-items-center rounded bg-blue-600 text-[10px] font-bold text-white"
          aria-hidden="true"
          >D</span
        >
        <span>Diário &amp; Logs</span>
      </header>

      <!--
        The sidebar lists the manifest, and only the manifest.

        The design it is modelled on shows Inbox, Histórico and Tags as well.
        Those are not modules of this product — inventing links that lead
        nowhere would make a screenshot that lies about what the app does, and
        the flag mechanism exists precisely so what ships is what is built.
      -->
      <nav class="flex flex-col gap-0.5" data-testid="nav" aria-label="Módulos">
        <button
          v-for="module in modules"
          :key="module.id"
          type="button"
          :data-route="module.route"
          :aria-current="module.route === current ? 'page' : undefined"
          class="rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-white/5 hover:text-gray-200"
          :class="
            module.route === current ? 'bg-white/5 text-gray-100' : 'text-[#747e8f]'
          "
          @click="emit('navigate', module.route)"
        >
          {{ module.title }}
        </button>
      </nav>

      <!--
        ADR 0007 asks for the zone to be visible *always*, not tucked into
        Settings, because every date on every screen is derived from it. The
        sidebar footer is the one place on this layout that is always on screen.
      -->
      <footer
        class="mt-auto border-t border-[#1e2638] px-2 pt-3 text-xs text-[#747e8f]"
        data-testid="zone"
      >
        fuso: {{ deps.zone }}
      </footer>
    </aside>

    <main
      class="min-w-0 flex-1 overflow-y-auto bg-[#0c101b]"
      data-testid="outlet"
    >
      <component :is="component" v-if="component" :deps="deps" />
    </main>
  </div>
</template>
