import type { FocusBoard, FocusLevel, NewProgram, Program, ProgramWithTasks, TaskKey } from '@dailly/tasks-core'

/** What focus is set on, as the screen names it: a program by id, or a task by its whole key. */
export type FocusTargetRef = { readonly program: string } | { readonly task: string }

/**
 * Programs and focus (LAB-9), the port the Tasks module consumes. A refusal
 * (a task already in another program, a task of a program put in focus) is
 * thrown with the server's message, which the screen shows as it comes.
 */
export interface ProgramsPort {
  /** Every program with its tasks, by creation. */
  programs(): Promise<readonly ProgramWithTasks[]>
  /** The input already parsed by `parseNewProgram`, so the form refuses before the call. */
  createProgram(input: NewProgram): Promise<Program>
  /** `null` when the program is gone; throws on a task that does not exist or sits in another program. */
  addToProgram(programId: string, key: string): Promise<ProgramWithTasks | null>
  /** The task's program, `{ program: null }` when it has none, `null` when the task is gone. */
  programOf(key: TaskKey): Promise<{ readonly program: Program | null } | null>
  focus(): Promise<FocusBoard>
  /** `false` when the target is gone; throws for a task of a program. */
  setFocus(target: FocusTargetRef, level: FocusLevel | null): Promise<boolean>
}

export type { FocusBoard, FocusItem, FocusLevel, NewProgram, Program, ProgramTask, ProgramWithTasks } from '@dailly/tasks-core'
