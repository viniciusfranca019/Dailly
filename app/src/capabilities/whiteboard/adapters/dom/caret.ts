/**
 * Caret plumbing.
 *
 * Every structural edit re-renders the block and throws away the node the
 * caret lived in, so the adapter has to put it back by hand. Offsets are
 * counted in characters from the start of the text element, which survives
 * the re-render — node references do not.
 */

/** First text node of `el`, created if the element is empty. */
export function textNodeOf(el: HTMLElement): Text {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const existing = walker.nextNode() as Text | null
  if (existing) return existing

  const created = el.ownerDocument.createTextNode('')
  el.appendChild(created)
  return created
}

/** Caret position inside `el`, in characters. 0 when the caret is elsewhere. */
export function getCaretOffset(el: HTMLElement): number {
  const selection = el.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return 0

  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return 0

  const probe = range.cloneRange()
  probe.selectNodeContents(el)
  probe.setEnd(range.startContainer, range.startOffset)
  return probe.toString().length
}

/** True when there is a non-empty selection inside `el`. */
export function hasSelection(el: HTMLElement): boolean {
  const selection = el.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  return !range.collapsed && el.contains(range.startContainer)
}

/** Place the caret `offset` characters into `el`, clamped to its length. */
export function setCaret(el: HTMLElement, offset: number): void {
  const doc = el.ownerDocument
  const node = textNodeOf(el)
  const range = doc.createRange()
  range.setStart(node, Math.max(0, Math.min(offset, node.data.length)))
  range.collapse(true)

  const selection = doc.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Replace the current selection inside `el` with plain text. */
export function insertTextAtCaret(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument
  const selection = doc.getSelection()
  const offset = getCaretOffset(el)

  if (!selection || selection.rangeCount === 0 || !el.contains(selection.getRangeAt(0).startContainer)) {
    el.textContent = `${el.textContent ?? ''}${text}`
    setCaret(el, (el.textContent ?? '').length)
    return
  }

  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(doc.createTextNode(text))
  el.normalize()
  setCaret(el, offset + text.length)
}
