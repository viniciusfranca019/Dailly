import type { LabelsPort, ProgramsPort, TasksPort } from '@shared'

/** What is only the Tasks module's: the port to the tasks, and the global labels (card #46). */
export interface TasksDeps {
  readonly tasks: TasksPort
  /** The same labels as the Daily Log's (RN13), built once at the root. */
  readonly labels: LabelsPort
  /** Programs and focus (LAB-9), over the same tasks. */
  readonly programs: ProgramsPort
}
