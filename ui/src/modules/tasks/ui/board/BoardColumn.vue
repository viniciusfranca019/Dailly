<script setup lang="ts">
import type { TaskStatus } from '@dailly/tasks-core'
import type { Label } from '@shared'
import type { TimeZone } from '@dailly/periods'
import { completionLabel } from '../../model/completion.js'
import type { StatusGroup } from '../../model/list.js'
import NewTask from '../list/NewTask.vue'
import StatusHeading from '../statuses/StatusHeading.vue'
import TaskCard from './TaskCard.vue'

/**
 * A column of the board. Dropping on a card puts the dragged one above it;
 * dropping on the rest of the column puts it at the bottom.
 */
const props = defineProps<{
  group: StatusGroup
  zone: TimeZone
  composing: boolean
  create: (statusId: string, title: string) => Promise<void>
  labels: readonly Label[]
}>()
const emit = defineEmits<{
  compose: [statusId: string]
  cancel: []
  grab: [key: number]
  release: []
  open: [key: number]
  drop: [statusId: string, beforeKey: number | null]
  editStatus: [status: TaskStatus]
  removeStatus: [status: TaskStatus]
}>()

const createHere = (title: string) => props.create(props.group.status.id, title)
</script>

<template>
  <section
    :aria-label="group.status.name"
    class="flex w-72 shrink-0 flex-col rounded-lg border border-[#1e2638] bg-white/[0.02]"
    @dragover.prevent
    @drop.prevent="emit('drop', group.status.id, null)"
  >
    <header class="flex items-center gap-2 px-3 py-2">
      <StatusHeading
        :status="group.status"
        :count="group.tasks.length"
        @edit="emit('editStatus', group.status)"
        @remove="emit('removeStatus', group.status)"
      />
      <button
        type="button"
        :aria-label="`Nova tarefa em ${group.status.name}`"
        class="ml-auto rounded px-2 text-[#747e8f] hover:bg-[#1e2638] hover:text-gray-100"
        @click="emit('compose', group.status.id)"
      >
        +
      </button>
    </header>
    <NewTask v-if="composing" :status-name="group.status.name" :create="createHere" @cancel="emit('cancel')" />
    <ul class="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
      <TaskCard
        v-for="task in group.tasks"
        :key="task.id"
        :task="task"
        :completion="completionLabel(task.completedAt, zone)"
        :labels="labels"
        @grab="emit('grab', $event)"
        @release="emit('release')"
        @open="emit('open', $event)"
        @drop="emit('drop', group.status.id, $event)"
      />
    </ul>
  </section>
</template>
