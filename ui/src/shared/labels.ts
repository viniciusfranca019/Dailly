import type { Label, LabelColor } from '@dailly/domain'

/**
 * The global labels (PRD Fase 2, RN1, card #34), in the words of the screens
 * that use them: the Daily Log now, the Tasks v2 later. A refusal arrives as
 * an `Error` whose message is the one to show ("já existe uma label com esse
 * nome", "o nome da label é obrigatório").
 */
export interface LabelsPort {
  list(): Promise<Label[]>
  create(input: { name: string; color: LabelColor }): Promise<Label>
  /** `null` when the label no longer exists. */
  update(id: string, change: { name?: string; color?: LabelColor }): Promise<Label | null>
  /** `false` when it was already gone. */
  delete(id: string): Promise<boolean>
}

export type { Label, LabelColor } from '@dailly/domain'
