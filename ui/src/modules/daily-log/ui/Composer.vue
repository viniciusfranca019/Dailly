<script setup lang="ts">
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { TEXT_ATTR, mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
import type { CalendarDay } from '@dailly/periods'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { formatDay } from './timeline.js'
import { isLoggable } from './entry-date.js'

/**
 * The editor card: a title, a toolbar, the whiteboard, and two buttons.
 *
 * **The whiteboard is an island.** `mountWhiteboard` owns everything inside
 * `boardHost`; Vue never renders in there. The element is empty in the template
 * for that reason, and the click handler only redirects focus.
 */
const props = defineProps<{
  title: string
  saving: boolean
  /** The day this entry will be logged to. */
  day: CalendarDay
  /** Today, in the configured zone — nothing after it may be picked. */
  maxDay: CalendarDay
}>()
const emit = defineEmits<{ submit: [body: string]; cancel: []; 'update:day': [day: CalendarDay] }>()

const picker = ref<HTMLInputElement | null>(null)

/** Open the native calendar from the icon, which is where the design puts it. */
function openPicker(): void {
  const input = picker.value
  if (!input) return
  // `showPicker` needs a user gesture, which a click is. Where it does not
  // exist — jsdom, older engines — focusing still gets the person to the field.
  if ('showPicker' in input) input.showPicker()
  else input.focus()
}

function pickDay(event: Event): void {
  const chosen = (event.target as HTMLInputElement).value
  // `max` keeps the calendar from offering a future day, but a date input can
  // also be typed into, and not every engine blocks that. The rule is enforced
  // where it cannot be walked around.
  if (!chosen || !isLoggable(chosen, `${props.maxDay}T12:00:00.000Z`, 'UTC')) {
    ;(event.target as HTMLInputElement).value = props.day
    return
  }
  emit('update:day', chosen)
}

const backdated = computed(() => props.day !== props.maxDay)

const boardHost = ref<HTMLElement | null>(null)
const board = shallowRef<WhiteboardHandle | null>(null)
const doc = shallowRef<WhiteboardDocument | null>(null)
const empty = ref(true)

/**
 * The toolbar, and why it is these buttons.
 *
 * No B / I / U: the model has no inline marks — a block is a type and a line of
 * text — so those buttons could only ever be decoration. What is here maps to
 * block types that exist, through the same `transform` the typed shortcuts use.
 * Inline formatting is a change to the model, not a button.
 */
const TOOLS = [
  { label: 'H1', title: 'Título', prefix: '# ' },
  { label: 'H2', title: 'Subtítulo', prefix: '## ' },
  { label: '•', title: 'Lista', prefix: '- ' },
  { label: '1.', title: 'Lista numerada', prefix: '1. ' },
  { label: '☐', title: 'Tarefa', prefix: '[] ' },
] as const

/** The block the caret is in, or the last one — what a toolbar click acts on. */
function currentBlock(): { id: string; text: string } | undefined {
  const host = boardHost.value
  const store = doc.value
  if (!host || !store) return undefined

  const active = document.activeElement as HTMLElement | null
  const element =
    active && host.contains(active) && active.hasAttribute(TEXT_ATTR)
      ? active
      : [...host.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)].pop()
  const id = element?.closest('[data-wb-id]')?.getAttribute('data-wb-id')
  return id ? { id, text: element?.textContent ?? '' } : undefined
}

function applyTool(prefix: string): void {
  const block = currentBlock()
  if (!block || !doc.value) return
  // Re-read the line as if the shortcut had been typed: one syntax table, used
  // by the keyboard and by the toolbar alike.
  doc.value.transform(block.id, `${prefix}${block.text}`)
  focusEditor()
}

function focusEditor(): void {
  const blocks = boardHost.value?.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`)
  blocks?.[blocks.length - 1]?.focus()
}

/**
 * Clicking the card's empty space puts the caret in the editor.
 *
 * Without it only the text line itself is a target and the padding around it is
 * dead — the person clicks inside the box, nothing happens, and the app looks
 * broken. Clicks that land on a block are left alone, so the adapter keeps
 * owning caret placement inside the text.
 */
function focusFromBackdrop(event: MouseEvent): void {
  if (event.target !== event.currentTarget) return
  focusEditor()
}

function submit(): void {
  emit('submit', doc.value?.toMarkdown() ?? '')
}

/**
 * Ctrl+S (Cmd+S) registers, as it would in anything else that holds text.
 *
 * On `window` and not on the card: the caret is usually inside the whiteboard,
 * but it can also be in the search box or nowhere at all, and a shortcut that
 * works only while a particular element has focus is a shortcut people stop
 * trusting. The listener lives and dies with this component, so it cannot fire
 * for a module that is not on screen.
 *
 * It does **not** live in the whiteboard. That capability knows nothing about
 * an Entry — saving one is this screen's business, and pushing the shortcut
 * down there would make the editor know what it is being used for.
 */
function onShortcut(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return

  // Always taken from the browser, even when there is nothing to register: in
  // a desktop shell this key opens a "save page" dialog over the app.
  event.preventDefault()
  if (empty.value || props.saving) return
  submit()
}

/** Emptying through the document: the model is the source of truth. */
function clear(): void {
  doc.value?.setMarkdown('')
}

defineExpose({ clear })

let unsubscribe: (() => void) | undefined

onMounted(() => {
  window.addEventListener('keydown', onShortcut)

  const host = boardHost.value
  if (!host) return
  const store = new WhiteboardDocument('')
  doc.value = store
  board.value = mountWhiteboard(host, store)
  unsubscribe = store.subscribe(() => {
    empty.value = store.toMarkdown().trim() === ''
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onShortcut)
  unsubscribe?.()
  board.value?.destroy()
  board.value = null
})
</script>

<template>
  <section
    class="flex h-full flex-col rounded-xl border border-[#1e2638] bg-[#121724] p-6"
    data-testid="composer"
  >
    <h1 class="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-gray-100">
      <!--
        The icon is the way in to the calendar. An icon, not the emoji the
        design used: this machine renders 📝 as a tofu box, and an emoji depends
        on a font the host may not have, while an inline SVG looks the same
        everywhere and inherits the colour around it.
      -->
      <button
        type="button"
        class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-blue-500 transition-colors hover:bg-white/5"
        title="Escolher a data do registro"
        aria-label="Escolher a data do registro"
        data-testid="pick-day"
        @click="openPicker"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 2v3M16 2v3M3.5 8.5h17" />
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        </svg>
      </button>

      <!--
        The real control, kept out of the layout but not out of the page: it is
        a focusable field with a `max`, so the keyboard and the calendar both
        work. `sr-only` and not `hidden`, which would make `showPicker` throw.
      -->
      <input
        ref="picker"
        type="date"
        class="sr-only"
        :value="props.day"
        :max="props.maxDay"
        data-testid="day-input"
        @change="pickDay"
      />

      <span>{{ props.title }}</span>
    </h1>

    <!--
      The title keeps saying today on purpose. Someone who picked yesterday to
      log one thing and then forgot would otherwise type today's entry under a
      heading that looks right — so the override gets its own line, and it names
      the day rather than just saying "backdated".
    -->
    <p
      v-if="backdated"
      class="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300"
      data-testid="backdated"
    >
      registrando em {{ formatDay(props.day) }}
    </p>

    <div class="mt-4 flex items-center gap-1 border-b border-[#1e2638] pb-3">
      <button
        v-for="tool in TOOLS"
        :key="tool.label"
        type="button"
        :title="tool.title"
        class="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-medium text-[#747e8f] transition-colors hover:bg-white/5 hover:text-gray-200"
        data-testid="tool"
        @click="applyTool(tool.prefix)"
      >
        {{ tool.label }}
      </button>
    </div>

    <!--
      Owned by the whiteboard adapter. The placeholder copy is set through the
      token the board exposes, so this screen says what it wants said without
      the capability learning what a diary is.
    -->
    <div
      ref="boardHost"
      class="wb-composer mt-4 min-h-40 flex-1 cursor-text text-[15px] leading-relaxed"
      data-testid="board"
      @click="focusFromBackdrop"
    ></div>

    <footer class="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-md px-4 py-2 text-sm font-medium text-[#747e8f] transition-colors hover:text-gray-300"
        data-testid="cancel"
        @click="clear"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/10 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="props.saving || empty"
        title="Ctrl+S"
        data-testid="submit"
        @click="submit"
      >
        {{ props.saving ? 'registrando…' : 'Registrar' }}
      </button>
    </footer>
  </section>
</template>

<style>
/* The board's own token, set where the board is used. */
.wb-composer {
  --wb-placeholder: 'Escreva o que aconteceu hoje… / para comandos';
}
</style>
