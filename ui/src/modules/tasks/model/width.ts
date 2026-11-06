/**
 * The task panel's width limits (card #44): 576 px is the `max-w-xl` the
 * panel had before it could be resized, so it opens as it always did, and
 * 360 to 960 px follows the Linear's side panel.
 */
export const PANEL_WIDTH = { min: 360, max: 960, initial: 576 } as const

/** A width the panel can take: whole pixels, inside the limits (C3). */
export function clampPanelWidth(requested: number): number {
  return Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(requested)))
}

/**
 * The width a stored value stands for. Nothing stored, or something that is
 * not a number, is the default; a number out of range is its nearest limit,
 * so a value written by an older build never shows up as an error.
 */
export function readPanelWidth(raw: string | null): number {
  if (raw === null || raw.trim() === '') return PANEL_WIDTH.initial
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clampPanelWidth(parsed) : PANEL_WIDTH.initial
}
