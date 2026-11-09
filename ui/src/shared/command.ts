/**
 * The seam for module commands (cards #47 and #48): a module contributes a
 * command by its manifest entry and a component, and the shell opens it from a
 * shortcut on any screen, over the screen, with no route by URL (TAIL T1).
 *
 * Kept in `shared/` next to `vue-module.ts` for the same reason: a module
 * never imports the composition root.
 */

/** `mod`: Ctrl, or Meta on a Mac. A bare key is taken only outside a field (RN15). */
export interface Shortcut {
  readonly key: string
  readonly mod?: boolean
}

/** What the manifest declares: the id of the module's component, and its key. */
export interface ModuleCommand {
  readonly id: string
  readonly shortcut: Shortcut
}

/** The props a command's component gets from the shell. */
export interface CommandProps<TDeps> {
  readonly deps: TDeps
  /** Grows each time the shortcut is pressed again with the command open: take the focus back. */
  readonly focusTick: number
  navigate(route: string): void
  close(): void
  /** A short notice the shell shows for a few seconds, after the command has closed ("CASA-2 criada", card #48). */
  notify(text: string): void
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const mod = event.ctrlKey || event.metaKey
  // Shift only on a bare letter, where C is c (card #48): Ctrl+Shift+K is the browser's, not this shortcut.
  const shiftOk = !event.shiftKey || !shortcut.mod
  return event.key.toLowerCase() === shortcut.key && !event.altKey && shiftOk && mod === (shortcut.mod ?? false)
}

/** RN15: a shortcut without Ctrl/Meta would be typed into a field, so it waits outside one. */
export function blockedByFocus(shortcut: Shortcut, target: EventTarget | null): boolean {
  if (shortcut.mod) return false
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select') || target.isContentEditable || target.closest('[contenteditable="true"]') !== null
}
