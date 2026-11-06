<script setup lang="ts">
import type { TaskStatus } from '@dailly/tasks-core'
import type { Label } from '@shared'
import type { TimeZone } from '@dailly/periods'
import { completionLabel } from '../../model/completion.js'
import type { StatusGroup } from '../../model/list.js'
import NewTask from './NewTask.vue'
import TaskRow from './TaskRow.vue'
import StatusHeading from '../statuses/StatusHeading.vue'

/** A status's header (name, count, "+") and its tasks; the capture opens on top. */
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
  open: [key: number]
  editStatus: [status: TaskStatus]
  removeStatus: [status: TaskStatus]
}>()

const createHere = (title: string) => props.create(props.group.status.id, title)
</script>

<template>
  <section :aria-label="group.status.name" class="rounded-lg border border-[#1e2638]">
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
    <ul v-if="group.tasks.length > 0">
      <TaskRow
        v-for="task in group.tasks"
        :key="task.id"
        :task="task"
        :completion="completionLabel(task.completedAt, zone)"
        :labels="labels"
        @open="emit('open', $event)"
      />
    </ul>
  </section>
</template>
