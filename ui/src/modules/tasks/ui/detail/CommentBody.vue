<script setup lang="ts">
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard, type WhiteboardHandle } from '@capabilities/whiteboard/dom'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * A comment's body, read only: the whiteboard with `editable: false`, so the
 * markdown reads as it does in the editor, with no renderer of its own (card
 * #45's Latitude).
 */
const props = defineProps<{ body: string }>()

const host = ref<HTMLElement | null>(null)
let handle: WhiteboardHandle | null = null

onMounted(() => {
  if (host.value) handle = mountWhiteboard(host.value, new WhiteboardDocument(props.body), { editable: false })
})
onBeforeUnmount(() => handle?.destroy())
</script>

<template>
  <div ref="host" class="text-sm text-gray-200" />
</template>
