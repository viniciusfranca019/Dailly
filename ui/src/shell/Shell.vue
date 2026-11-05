<script setup lang="ts">
import { nextTick, ref, useTemplateRef, type Component } from 'vue'
import type { ModuleDescriptor, SharedDeps, VueModule } from '@shared'
import type { TimeZone } from '@dailly/periods'
import { moveBy, moveOnto } from './nav-order.js'

/**
 * The frame: sidebar, navigation, zone, and the outlet the current module
 * renders into.
 *
 * Presentational on purpose. It owns no route and loads no module — it is
 * handed what to show and reports what was clicked, which is what keeps the
 * routing state in `mount.ts` where `ShellHandle` can expose it without
 * `defineExpose` gymnastics.
 */
const props = defineProps<{
  modules: readonly ModuleDescriptor<VueModule>[]
  /** Shown in the frame; the frame reads nothing else of the deps. */
  zone: TimeZone
  /** The current module's deps: the shared half plus its own. */
  deps: SharedDeps
  /** Route currently on screen; drives the active mark on the navigation. */
  current: string
  /** The module to render, or `null` before the first one has loaded. */
  component: Component | null
  /** Set when a module could not be loaded, so the outlet can say which. */
  failed: { route: string; title: string } | null
}>()

const emit = defineEmits<{ navigate: [route: string]; reorder: [order: string[]] }>()

/**
 * Reordering is computed here and handed up whole, because the order on screen
 * is `modules` and nothing else: the frame says what the new list is, and
 * `mount.ts`, which owns the state, keeps it.
 */
const ids = () => props.modules.map((module) => module.id)

/** The module being dragged; cleared on `dragend`, dropped or not. */
const grabbed = ref<string | null>(null)

function drop(target: string): void {
  if (grabbed.value === null) return
  emit('reorder', moveOnto(ids(), grabbed.value, target))
  grabbed.value = null
}

const nav = useTemplateRef<HTMLElement>('nav')

/** Alt+↑/↓: the keyboard path to the same reorder, focus kept on the moved button. */
async function nudge(event: KeyboardEvent, id: string): Promise<void> {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  emit('reorder', moveBy(ids(), id, event.key === 'ArrowUp' ? -1 : 1))
  await nextTick()
  const buttons = nav.value?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ;[...buttons].find((button) => button.dataset.id === id)?.focus()
}
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
      <nav
        ref="nav"
        class="flex flex-col gap-0.5"
        data-testid="nav"
        aria-label="Módulos"
        aria-description="Arraste, ou use Alt+↑ e Alt+↓, para mudar a ordem"
      >
        <button
          v-for="module in modules"
          :key="module.id"
          type="button"
          :data-route="module.route"
          :data-id="module.id"
          draggable="true"
          :aria-current="module.route === current ? 'page' : undefined"
          class="rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-white/5 hover:text-gray-200"
          :class="[
            module.route === current ? 'bg-white/5 text-gray-100' : 'text-[#747e8f]',
            grabbed === module.id ? 'opacity-50' : '',
          ]"
          @click="emit('navigate', module.route)"
          @dragstart="grabbed = module.id"
          @dragover.prevent
          @drop.prevent="drop(module.id)"
          @dragend="grabbed = null"
          @keydown="nudge($event, module.id)"
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
        fuso: {{ zone }}
      </footer>
    </aside>

    <!--
      `tabindex="0"` because this element scrolls. A scroll container with no
      focusable child — the Analyse screen is exactly that — cannot be reached
      by keyboard at all, so its content becomes unreadable past the fold for
      anyone not using a mouse.
    -->
    <main
      class="min-w-0 flex-1 overflow-y-auto bg-[#0c101b]"
      data-testid="outlet"
      tabindex="0"
    >
      <p
        v-if="failed"
        role="alert"
        class="mx-auto max-w-2xl px-8 py-10 text-sm leading-relaxed text-[#747e8f]"
      >
        <strong class="font-medium text-gray-300">{{ failed.title }}</strong> não pôde ser
        carregado. O módulo está no manifesto, mas o código dele não chegou — clique de
        novo para tentar outra vez.
      </p>
      <component :is="component" v-else-if="component" :deps="deps" />
    </main>
  </div>
</template>
