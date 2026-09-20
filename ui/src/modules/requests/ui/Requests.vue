<script setup lang="ts">
import type { ModuleDeps } from '@shared'

defineProps<{ deps: ModuleDeps }>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="requests"></div>
</template>
